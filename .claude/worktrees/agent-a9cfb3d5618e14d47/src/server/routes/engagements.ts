/**
 * Engagements Routes
 * Spec 037 — Consultants Management (Engagement Core)
 *
 * Owns /api/engagements/* — the Company-to-Company engagement surface.
 * Mounted in src/server/app.ts as /api/engagements.
 */

import { Router, Response, type Request } from "express";
import { z } from "zod";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "../db/client.js";
import {
  engagementinvitations,
  engagements,
  engagementassignments,
  subassignments,
  companies,
  userprofiles,
  companyprojects,
  projecttasks,
  projectinvoices,
  // projecttimeentries + projectspecifications are referenced via raw SQL
  // inside db.execute() — TypeScript sees them as unused, but the runtime SQL
  // depends on the table/column names being present in the schema graph.
} from "../../db/schema/index.js";
import { or, isNull, sql, inArray } from "drizzle-orm";
import { sqlEqU, expandError } from "../lib/sqlHelpers.js";
import {
  authenticateToken,
  requireAuth,
  softAuthenticateToken,
  AuthRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { createLogger } from "../lib/logger.js";
import { sendEmail } from "../lib/email.js";
import {
  getEngagementInvitationEmailHTML,
  getEngagementInvitationEmailText,
} from "../lib/emailTemplates.js";
import { hashPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import {
  resolveEngagementContext,
  requireClientAdmin,
  requireConsultingSide,
  requireConsultingAdminOrManager,
  requireWriteAllowed,
  type EngagementAuthRequest,
} from "../middleware/engagementContext.js";
import {
  applyTransition,
  transitionToAuditAction,
  InvalidTransitionError,
  type EngagementTransition,
  type EngagementState,
} from "../lib/engagementStateMachine.js";
import { logAuditEvent } from "../services/AuditService.js";
import {
  notifyEngagementStateChange,
  notifyAssignmentsModified,
} from "../services/EngagementNotifications.js";
import {
  enqueueModification,
  drainPendingModifications,
} from "../services/EngagementModificationQueue.js";

const router = Router();
const logger = createLogger("engagements-routes");

const INVITATION_EXPIRY_DAYS = 7;

// ─── Public routes (no auth required) ────────────────────────────────────────

/**
 * GET /api/engagements/invite/:token
 * T013 — public token validator. Returns invitation metadata if valid.
 */
// [SCOPE 037 / T013] BEGIN — public token validator
router.get(
  "/invite/:token",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.params;

      const rows = await db
        .select({
          id: engagementinvitations.id,
          invitedemail: engagementinvitations.invitedemail,
          status: engagementinvitations.status,
          expiresat: engagementinvitations.expiresat,
          message: engagementinvitations.message,
          clientcompanyid: engagementinvitations.clientcompanyid,
        })
        .from(engagementinvitations)
        .where(
          and(
            eq(engagementinvitations.token, token),
            eq(engagementinvitations.status, "pending"),
          ),
        )
        .limit(1);

      if (rows.length === 0) {
        res.status(404).json({
          code: "INVITATION_NOT_FOUND",
          error: "Engagement invitation not found or already used",
        });
        return;
      }

      const inv = rows[0];

      if (inv.expiresat && new Date(inv.expiresat) < new Date()) {
        res.status(410).json({
          code: "INVITATION_EXPIRED",
          error: "Engagement invitation has expired",
        });
        return;
      }

      const company = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, inv.clientcompanyid))
        .limit(1);

      res.json({
        invitedEmail: inv.invitedemail,
        clientCompanyName: company[0]?.name ?? "Unknown Company",
        clientCompanyId: company[0]?.id ?? null,
        message: inv.message,
        expiresAt: inv.expiresat,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error(
        { error: expanded },
        "Validate engagement invitation error",
      );
      res.status(500).json({
        code: "VALIDATE_INVITATION_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T013] END

/**
 * POST /api/engagements/invite/:token/accept
 * T014 + T015 — single accept endpoint. Branches:
 *   - Caller has session AND email matches → existing-user path
 *     (their primary Company must be CONSULTANT-plan; they must be ADMIN)
 *   - Body includes `provisionCompany` → auto-provision path (FR-003)
 *   - Otherwise → 400
 */
const provisionCompanySchema = z.object({
  companyName: z.string().min(1).max(255),
  contactFullName: z.string().min(1).max(255),
  password: z.string().min(8, "Password must be at least 8 characters"),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "Must accept CONSULTANT-plan terms" }),
  }),
  timezone: z.string().default("UTC"),
});

const acceptInvitationSchema = z.object({
  provisionCompany: provisionCompanySchema.optional(),
});

// [SCOPE 037 / T014] BEGIN — accept engagement invitation (single endpoint, branches)
// softAuthenticateToken so the existing-user branch can read req.userid from
// the JWT cookie without 401'ing the new-email path.
router.post(
  "/invite/:token/accept",
  softAuthenticateToken,
  validateBody(acceptInvitationSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { token } = req.params;
      const { provisionCompany } = req.body as {
        provisionCompany?: z.infer<typeof provisionCompanySchema>;
      };

      // 1) Validate the invitation token.
      const invRows = await db
        .select()
        .from(engagementinvitations)
        .where(
          and(
            eq(engagementinvitations.token, token),
            eq(engagementinvitations.status, "pending"),
          ),
        )
        .limit(1);

      if (invRows.length === 0) {
        res.status(404).json({
          code: "INVITATION_NOT_FOUND",
          error: "Engagement invitation not found or already used",
        });
        return;
      }
      const invitation = invRows[0];

      if (invitation.expiresat && new Date(invitation.expiresat) < new Date()) {
        res.status(410).json({
          code: "INVITATION_EXPIRED",
          error: "Engagement invitation has expired",
        });
        return;
      }

      // 2) Look up the user by invited email.
      const existingUserRows = await db
        .select({
          id: userprofiles.id,
          usertype: userprofiles.usertype,
          companyid: userprofiles.companyid,
        })
        .from(userprofiles)
        .where(eq(userprofiles.emailaddr, invitation.invitedemail))
        .limit(1);

      let consultingCompanyId: string;
      let acceptedById: string;
      let issuedAuthToken: string | null = null;

      if (existingUserRows.length > 0) {
        // ─── Existing-user branch (FR-002 AC1/AC2) ───
        const existingUser = existingUserRows[0];

        // Caller must be authenticated AS the invited user.
        if (!req.userid) {
          res.status(401).json({
            code: "AUTH_REQUIRED",
            error:
              "An account exists for this email — please sign in to accept",
          });
          return;
        }
        if (req.userid !== existingUser.id) {
          res.status(403).json({
            code: "WRONG_USER",
            error:
              "You are signed in as a different user; the invitation is for someone else",
          });
          return;
        }

        // Existing user's primary Company must be on CONSULTANT plan (FR-002 AC2).
        const companyRows = await db
          .select({
            id: companies.id,
            billingplan: companies.billingplan,
            activeflag: companies.activeflag,
          })
          .from(companies)
          .where(eq(companies.id, existingUser.companyid))
          .limit(1);

        if (companyRows.length === 0 || !companyRows[0].activeflag) {
          res.status(403).json({
            code: "PRIMARY_COMPANY_INACTIVE",
            error:
              "Your primary company is inactive — cannot accept engagement",
          });
          return;
        }
        if (companyRows[0].billingplan !== "CONSULTANT") {
          res.status(403).json({
            code: "NOT_CONSULTANT_PLAN",
            error:
              "Your primary company is not on the CONSULTANT plan — upgrade or use a different account",
            requiredPlan: "CONSULTANT",
          });
          return;
        }

        // Existing user must be ADMIN of their Consulting Company.
        if (existingUser.usertype !== "ADMIN") {
          res.status(403).json({
            code: "ADMIN_REQUIRED",
            error:
              "Only the ADMIN of a Consulting Company can accept an engagement",
          });
          return;
        }

        consultingCompanyId = existingUser.companyid;
        acceptedById = existingUser.id;
      } else {
        // ─── Auto-provision branch (FR-003) ───
        if (!provisionCompany) {
          res.status(400).json({
            code: "PROVISION_PAYLOAD_REQUIRED",
            error:
              "No wxKanban account exists for this email — provide provisionCompany payload to set up your Consulting Company",
          });
          return;
        }

        // Create the new CONSULTANT-plan tenant.
        const newCompanyId = uuidv7();
        await db.insert(companies).values({
          id: newCompanyId,
          name: provisionCompany.companyName,
          contactemail: invitation.invitedemail,
          billingplan: "CONSULTANT",
          // SubscriptionStatus 'TRIAL' so the auto-provisioned tenant lands
          // on free/trial state per scope 037 constraints 6B, not on a paid sub.
          subscriptionstatus: "TRIAL",
          maxusers: 5,
          activeflag: true,
        });

        // Create the ADMIN userprofile for the new tenant.
        const newUserId = uuidv7();
        const passwordHash = await hashPassword(provisionCompany.password);
        await db.insert(userprofiles).values({
          id: newUserId,
          emailaddr: invitation.invitedemail,
          password: passwordHash,
          fullname: provisionCompany.contactFullName,
          companyid: newCompanyId,
          usertype: "ADMIN",
          active: true,
          securitylevel: 7,
          timezone: provisionCompany.timezone,
          tracktime: true,
          joinedat: new Date(),
        });

        // Issue auth token for auto-login (FR-003 AC4: land in engagement view).
        issuedAuthToken = signToken(
          newUserId,
          invitation.invitedemail,
          {
            companyid: newCompanyId,
            usertype: "ADMIN",
            billingplan: "CONSULTANT",
            subscriptionstatus: "TRIAL",
            maxusers: 5,
          },
          "ADMIN",
        );

        consultingCompanyId = newCompanyId;
        acceptedById = newUserId;

        logger.info(
          {
            companyId: newCompanyId,
            userId: newUserId,
            email: invitation.invitedemail,
          },
          "Auto-provisioned Consulting Company tenant",
        );
      }

      // 3) Create the engagement row. The partial unique constraint blocks a
      //    second open engagement for the same (client, consulting) pair.
      const engagementId = uuidv7();
      const now = new Date();
      try {
        await db.insert(engagements).values({
          id: engagementId,
          clientcompanyid: invitation.clientcompanyid,
          consultingcompanyid: consultingCompanyId,
          state: "active",
          invitationid: invitation.id,
          createdat: now,
          createdbyid: acceptedById,
          acceptedat: now,
          acceptedbyid: acceptedById,
        });
      } catch (insertErr) {
        const message =
          insertErr instanceof Error ? insertErr.message : String(insertErr);
        // Likely unique-constraint violation: an open engagement already
        // exists between these two companies (FR-007 — one engagement spans
        // multiple projects).
        if (/uk_engagements_open_pair/i.test(message)) {
          res.status(409).json({
            code: "ENGAGEMENT_ALREADY_OPEN",
            error:
              "An open engagement already exists between these two companies",
          });
          return;
        }
        throw insertErr;
      }

      // 4) Mark the invitation accepted.
      await db
        .update(engagementinvitations)
        .set({ status: "accepted", acceptedat: now })
        .where(sqlEqU(engagementinvitations.id, invitation.id));

      logger.info(
        {
          engagementId,
          clientCompanyId: invitation.clientcompanyid,
          consultingCompanyId,
          invitationId: invitation.id,
        },
        "Engagement created",
      );

      // 5) Set auth cookie on auto-provision path so the new tenant lands
      //    signed-in (FR-003 AC4).
      if (issuedAuthToken) {
        const isProd = process.env.NODE_ENV === "production";
        res.cookie("token", issuedAuthToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: "lax",
          maxAge: 24 * 60 * 60 * 1000,
        });
      }

      res.status(201).json({
        success: true,
        engagement: {
          id: engagementId,
          clientCompanyId: invitation.clientcompanyid,
          consultingCompanyId,
          state: "active",
          acceptedAt: now,
        },
        provisioned: !!provisionCompany,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Accept engagement invitation error");
      res.status(500).json({
        code: "ACCEPT_INVITATION_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T014] END

// ─── Authenticated routes ────────────────────────────────────────────────────
router.use(authenticateToken, requireAuth);

/**
 * POST /api/engagements/invite
 * T012 — Client ADMIN creates an engagement invitation.
 */
const sendEngagementInviteSchema = z.object({
  invitedemail: z.string().email("Invalid email"),
  message: z.string().max(500).optional(),
});

// [SCOPE 037 / T012] BEGIN — Client ADMIN sends engagement invitation
router.post(
  "/invite",
  validateBody(sendEngagementInviteSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { invitedemail, message } = req.body as {
        invitedemail: string;
        message?: string;
      };
      const clientCompanyId = req.companyid;
      const invitedBy = req.userid;

      if (!clientCompanyId || !invitedBy) {
        res.status(401).json({
          code: "UNAUTHORIZED",
          error: "Not authenticated",
        });
        return;
      }

      // Only ADMIN of the Client Company can invite a Consulting Company.
      if (req.usertype !== "ADMIN") {
        res.status(403).json({
          code: "ADMIN_REQUIRED",
          error: "Only an ADMIN can invite a Consulting Company",
        });
        return;
      }

      // Dedup: refuse if there's already a pending engagement invitation to
      // the same email from this Client Company.
      const pendingRows = await db
        .select({ id: engagementinvitations.id })
        .from(engagementinvitations)
        .where(
          and(
            sqlEqU(engagementinvitations.clientcompanyid, clientCompanyId),
            eq(engagementinvitations.invitedemail, invitedemail),
            eq(engagementinvitations.status, "pending"),
          ),
        )
        .limit(1);

      if (pendingRows.length > 0) {
        res.status(409).json({
          code: "INVITATION_ALREADY_PENDING",
          error:
            "A pending engagement invitation already exists for this email",
        });
        return;
      }

      // Create the invitation row.
      const invitationId = uuidv7();
      const tokenValue = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(
        Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      );

      await db.insert(engagementinvitations).values({
        id: invitationId,
        clientcompanyid: clientCompanyId,
        invitedemail: invitedemail,
        invitedbyid: invitedBy,
        token: tokenValue,
        status: "pending",
        expiresat: expiresAt,
        message: message ?? null,
      });

      logger.info(
        {
          invitationId,
          clientCompanyId,
          invitedemail,
        },
        "Engagement invitation created",
      );

      // Send the invitation email. Don't fail the request if email fails —
      // the invitation row is still created and can be resent.
      try {
        const companyRows = await db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, clientCompanyId))
          .limit(1);
        const clientCompanyName = companyRows[0]?.name ?? "Your Client";

        const inviterRows = await db
          .select({ fullname: userprofiles.fullname })
          .from(userprofiles)
          .where(eq(userprofiles.id, invitedBy))
          .limit(1);
        const inviterName = inviterRows[0]?.fullname ?? "A Client ADMIN";

        const acceptLink = `${
          process.env.CLIENT_URL ?? "http://localhost:5173"
        }/engagements/invite/${tokenValue}/setup`;

        await sendEmail(
          invitedemail,
          `${clientCompanyName} has invited your firm to a consulting engagement on wxKanban`,
          getEngagementInvitationEmailHTML(
            invitedemail,
            inviterName,
            clientCompanyName,
            message ?? null,
            acceptLink,
          ),
          getEngagementInvitationEmailText(
            invitedemail,
            inviterName,
            clientCompanyName,
            message ?? null,
            acceptLink,
          ),
        );
        logger.info(
          { invitationId, invitedemail },
          "Engagement invitation email sent",
        );
      } catch (emailErr) {
        logger.error(
          {
            error: emailErr,
            invitationId,
            invitedemail,
          },
          "Failed to send engagement invitation email",
        );
      }

      res.status(201).json({
        success: true,
        invitationId,
        invitedemail,
        expiresAt,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Send engagement invitation error");
      res.status(500).json({
        code: "SEND_INVITATION_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T012] END

// ─── Lifecycle transitions (Phase 4) ─────────────────────────────────────────

/**
 * Internal helper: persist a state transition + write audit rows for BOTH tenants.
 * Called by all 5 lifecycle endpoints below.
 */
// [SCOPE 037 / T018] BEGIN — runStateTransition helper
async function runStateTransition(
  req: EngagementAuthRequest,
  res: Response,
  transition: EngagementTransition,
): Promise<void> {
  const ctx = req.engagementContext;
  if (!ctx || !req.userid) {
    res.status(500).json({
      code: "MISSING_CONTEXT",
      error: "Engagement context missing — middleware misconfigured",
    });
    return;
  }
  const { engagement } = ctx;
  const currentState = engagement.state as EngagementState;

  let nextState: EngagementState;
  try {
    nextState = applyTransition(currentState, transition);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      res.status(409).json({
        code: "INVALID_TRANSITION",
        error: err.message,
        currentState,
        attempted: transition,
      });
      return;
    }
    throw err;
  }

  const now = new Date();
  const updates: Record<string, unknown> = { state: nextState };
  if (transition === "pause") updates.pausedat = now;
  if (transition === "resume") updates.pausedat = null;
  if (transition === "disable") updates.disabledat = now;
  if (transition === "enable") updates.disabledat = null;
  if (transition === "end") {
    updates.endedat = now;
    updates.endedbyid = req.userid;
  }

  await db
    .update(engagements)
    .set(updates)
    .where(sqlEqU(engagements.id, engagement.id));

  // Audit rows for BOTH tenants (FR-004 AC5).
  const auditAction = transitionToAuditAction(transition);
  const details = {
    engagementId: engagement.id,
    fromState: currentState,
    toState: nextState,
  };
  await Promise.all([
    logAuditEvent({
      companyId: engagement.clientcompanyid,
      userId: req.userid,
      action: auditAction,
      resourceType: "engagement",
      resourceId: engagement.id,
      details,
      status: "success",
    }),
    logAuditEvent({
      companyId: engagement.consultingcompanyid,
      userId: req.userid,
      action: auditAction,
      resourceType: "engagement",
      resourceId: engagement.id,
      details,
      status: "success",
    }),
  ]);

  logger.info(
    {
      engagementId: engagement.id,
      transition,
      from: currentState,
      to: nextState,
      actorUserId: req.userid,
    },
    "Engagement state transition",
  );

  // FR-022: notify both sides on pause/disable/enable/end; resume is silent.
  if (transition !== "resume") {
    void notifyEngagementStateChange({
      engagementId: engagement.id,
      clientCompanyId: engagement.clientcompanyid,
      consultingCompanyId: engagement.consultingcompanyid,
      transition,
      fromState: currentState,
      toState: nextState,
      actorUserId: req.userid,
    });
  }

  // [SCOPE 037 / T028] BEGIN — drain queued modifications on return-to-active
  // FR-005 AC4: modifications queued during paused/disabled are applied here.
  // Both 'resume' (paused → active) and 'enable' (disabled → active) trigger.
  if (nextState === "active" && (transition === "resume" || transition === "enable")) {
    try {
      const result = await drainPendingModifications({
        engagementId: engagement.id,
        clientCompanyId: engagement.clientcompanyid,
      });
      if (result.applied > 0 || result.failed > 0) {
        logger.info(
          { engagementId: engagement.id, ...result },
          "Drained pending modifications on return-to-active",
        );
      }
    } catch (drainErr) {
      logger.error(
        { error: drainErr, engagementId: engagement.id },
        "Failed to drain pending modifications — operator must check engagementmodifications table",
      );
    }
  }
  // [SCOPE 037 / T028] END

  res.json({
    success: true,
    engagementId: engagement.id,
    state: nextState,
    transitionedAt: now,
  });
}
// [SCOPE 037 / T018] END

// [SCOPE 037 / T018] BEGIN — POST /:id/pause
router.post(
  "/:id/pause",
  resolveEngagementContext,
  requireClientAdmin,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    await runStateTransition(req, res,"pause");
  },
);
// [SCOPE 037 / T018] END

// [SCOPE 037 / T018] BEGIN — POST /:id/resume
router.post(
  "/:id/resume",
  resolveEngagementContext,
  requireClientAdmin,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    await runStateTransition(req, res,"resume");
  },
);
// [SCOPE 037 / T018] END

// [SCOPE 037 / T019] BEGIN — POST /:id/disable
router.post(
  "/:id/disable",
  resolveEngagementContext,
  requireClientAdmin,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    await runStateTransition(req, res,"disable");
  },
);
// [SCOPE 037 / T019] END

// [SCOPE 037 / T019] BEGIN — POST /:id/enable
router.post(
  "/:id/enable",
  resolveEngagementContext,
  requireClientAdmin,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    await runStateTransition(req, res,"enable");
  },
);
// [SCOPE 037 / T019] END

// [SCOPE 037 / T020] BEGIN — POST /:id/end (terminal)
router.post(
  "/:id/end",
  resolveEngagementContext,
  requireClientAdmin,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    await runStateTransition(req, res,"end");
  },
);
// [SCOPE 037 / T020] END

// ─── Listing + detail (Phase 5) ──────────────────────────────────────────────

// [SCOPE 037 / T022] BEGIN — GET /api/engagements (list visible)
router.get(
  "/",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const callerCompanyId = req.companyid;
      if (!callerCompanyId) {
        res.status(401).json({
          code: "UNAUTHORIZED",
          error: "Not authenticated",
        });
        return;
      }

      const includeEnded = req.query.includeEnded === "true";

      // [SCOPE 037 / T022] uuid-cast fix — prod Postgres rejects `uuid = text`
      // comparisons when pg driver sends params without the uuid OID. Cast
      // explicitly to keep the comparison typed.
      const baseFilter = sql`(${engagements.clientcompanyid} = ${callerCompanyId}::uuid OR ${engagements.consultingcompanyid} = ${callerCompanyId}::uuid)`;

      const rows = await db
        .select({
          id: engagements.id,
          clientcompanyid: engagements.clientcompanyid,
          consultingcompanyid: engagements.consultingcompanyid,
          state: engagements.state,
          createdat: engagements.createdat,
          acceptedat: engagements.acceptedat,
          pausedat: engagements.pausedat,
          disabledat: engagements.disabledat,
          endedat: engagements.endedat,
        })
        .from(engagements)
        .where(
          includeEnded
            ? baseFilter
            : sql`${baseFilter} AND ${engagements.state} != 'ended'`,
        );

      // Enrich with the OTHER company's name (the one the caller isn't).
      const otherCompanyIds = rows.map((r) =>
        r.clientcompanyid === callerCompanyId
          ? r.consultingcompanyid
          : r.clientcompanyid,
      );

      const companyRows =
        otherCompanyIds.length > 0
          ? await db
              .select({ id: companies.id, name: companies.name })
              .from(companies)
              .where(inArray(companies.id, otherCompanyIds))
          : [];
      const nameById = new Map(companyRows.map((c) => [c.id, c.name]));

      // Enrich with distinct project names per engagement (active assignments only).
      const engagementIds = rows.map((r) => r.id);
      const assignmentRows =
        engagementIds.length > 0
          ? await db
              .select({
                engagementid: engagementassignments.engagementid,
                projectid: engagementassignments.projectid,
                projectname: companyprojects.name,
              })
              .from(engagementassignments)
              .innerJoin(
                companyprojects,
                eq(companyprojects.id, engagementassignments.projectid),
              )
              .where(
                and(
                  inArray(engagementassignments.engagementid, engagementIds),
                  isNull(engagementassignments.removedat),
                ),
              )
          : [];
      const projectsByEngagement = new Map<
        string,
        Map<string, string>
      >();
      for (const a of assignmentRows) {
        let m = projectsByEngagement.get(a.engagementid);
        if (!m) {
          m = new Map<string, string>();
          projectsByEngagement.set(a.engagementid, m);
        }
        m.set(a.projectid, a.projectname);
      }

      const result = rows.map((r) => {
        const isClientSide = r.clientcompanyid === callerCompanyId;
        const otherId = isClientSide
          ? r.consultingcompanyid
          : r.clientcompanyid;
        const projectMap = projectsByEngagement.get(r.id);
        const projects = projectMap
          ? Array.from(projectMap.entries())
              .map(([id, name]) => ({ id, name }))
              .sort((a, b) => a.name.localeCompare(b.name))
          : [];
        return {
          id: r.id,
          state: r.state,
          role: isClientSide ? "client" : "consulting",
          counterpartyCompanyId: otherId,
          counterpartyCompanyName: nameById.get(otherId) ?? "Unknown",
          createdAt: r.createdat,
          acceptedAt: r.acceptedat,
          pausedAt: r.pausedat,
          disabledAt: r.disabledat,
          endedAt: r.endedat,
          projects,
          // Back-compat field for clients still reading projectNames (v<1.5.58)
          projectNames: projects.map((p) => p.name),
        };
      });

      res.json({ engagements: result, total: result.length });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "List engagements error");
      res
        .status(500)
        .json({
          code: "LIST_ENGAGEMENTS_ERROR",
          error: expanded.message,
          details: expanded,
        });
    }
  },
);
// [SCOPE 037 / T022] END

// [SCOPE 037 / T023] BEGIN — GET /api/engagements/:id (detail)
router.get(
  "/:id",
  resolveEngagementContext,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement, role } = req.engagementContext!;

      // Counts: assignments (both sides see), sub-assignments (Consulting only).
      const assignmentCount = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(engagementassignments)
        .where(
          and(
            sqlEqU(engagementassignments.engagementid, engagement.id),
            isNull(engagementassignments.removedat),
          ),
        );

      const consultingSubCount =
        role === "consulting"
          ? await db
              .select({ count: sql<number>`count(*)`.mapWith(Number) })
              .from(subassignments)
              .innerJoin(
                engagementassignments,
                eq(
                  subassignments.engagementassignmentid,
                  engagementassignments.id,
                ),
              )
              .where(
                and(
                  sqlEqU(engagementassignments.engagementid, engagement.id),
                  isNull(subassignments.removedat),
                ),
              )
          : null;

      const [clientRow, consultingRow] = await Promise.all([
        db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(eq(companies.id, engagement.clientcompanyid))
          .limit(1),
        db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(eq(companies.id, engagement.consultingcompanyid))
          .limit(1),
      ]);

      res.json({
        id: engagement.id,
        state: engagement.state,
        role,
        client: clientRow[0] ?? null,
        consulting: consultingRow[0] ?? null,
        createdAt: engagement.createdat,
        acceptedAt: engagement.acceptedat,
        pausedAt: engagement.pausedat,
        disabledAt: engagement.disabledat,
        endedAt: engagement.endedat,
        assignmentCount: assignmentCount[0]?.count ?? 0,
        // Sub-assignment count NOT exposed to Client (FR-009 AC3).
        subAssignmentCount:
          role === "consulting"
            ? (consultingSubCount?.[0]?.count ?? 0)
            : undefined,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Engagement detail error");
      res.status(500).json({
        code: "ENGAGEMENT_DETAIL_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T023] END

// ─── Assignments CRUD (Phase 5) ──────────────────────────────────────────────

// [SCOPE 037 / T024] BEGIN — GET /:id/assignments (list)
router.get(
  "/:id/assignments",
  resolveEngagementContext,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;
      const includeRemoved = req.query.includeRemoved === "true";

      const baseConditions = [
        sqlEqU(engagementassignments.engagementid, engagement.id),
      ];
      if (!includeRemoved) {
        baseConditions.push(isNull(engagementassignments.removedat));
      }

      const rows = await db
        .select({
          id: engagementassignments.id,
          scopeid: engagementassignments.scopeid,
          taskid: engagementassignments.taskid,
          projectid: engagementassignments.projectid,
          addedat: engagementassignments.addedat,
          addedbyid: engagementassignments.addedbyid,
          removedat: engagementassignments.removedat,
          removedbyid: engagementassignments.removedbyid,
        })
        .from(engagementassignments)
        .where(and(...baseConditions));

      // Group by project for UI rendering.
      const projectIds = Array.from(new Set(rows.map((r) => r.projectid)));
      const projectRows =
        projectIds.length > 0
          ? await db
              .select({
                id: companyprojects.id,
                name: companyprojects.name,
              })
              .from(companyprojects)
              .where(inArray(companyprojects.id, projectIds))
          : [];
      const projectNameById = new Map(
        projectRows.map((p) => [p.id, p.name]),
      );

      const byProject: Record<
        string,
        {
          projectId: string;
          projectName: string;
          assignments: typeof rows;
        }
      > = {};
      for (const r of rows) {
        const key = r.projectid;
        if (!byProject[key]) {
          byProject[key] = {
            projectId: r.projectid,
            projectName: projectNameById.get(r.projectid) ?? "Unknown project",
            assignments: [],
          };
        }
        byProject[key].assignments.push(r);
      }

      res.json({
        engagementId: engagement.id,
        groups: Object.values(byProject),
        total: rows.length,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "List assignments error");
      res.status(500).json({
        code: "LIST_ASSIGNMENTS_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T024] END

// [SCOPE 037 / T079] BEGIN — POST /:id/assignments { allProjects: true } (FR-031)
// One-time bulk add: a whole-project assignment on every ACTIVE project the Client
// Company owns that this engagement does not already hold at project level. Each
// project gets an ordinary row, so visibility, audit and YappChatt sync are unchanged.
// Registered ahead of the single add; any other body falls through to it.
const addAllProjectsSchema = z.object({ allProjects: z.literal(true) }).strict();

router.post(
  "/:id/assignments",
  (req: Request, _res: Response, next: (arg?: unknown) => void): void => {
    const body = req.body as { allProjects?: unknown } | undefined;
    next(body?.allProjects === true ? undefined : "route");
  },
  resolveEngagementContext,
  requireClientAdmin,
  validateBody(addAllProjectsSchema),
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;

      if (engagement.state === "ended") {
        res.status(403).json({
          code: "ENGAGEMENT_ENDED",
          error: "This engagement has ended; assignments cannot be added.",
        });
        return;
      }

      const projects = await db
        .select({ id: companyprojects.id })
        .from(companyprojects)
        .where(
          and(
            sqlEqU(companyprojects.companyid, engagement.clientcompanyid),
            eq(companyprojects.status, "ACTIVE"),
          ),
        );
      const held = await db
        .select({ projectid: engagementassignments.projectid })
        .from(engagementassignments)
        .where(
          and(
            sqlEqU(engagementassignments.engagementid, engagement.id),
            isNull(engagementassignments.removedat),
            isNull(engagementassignments.scopeid),
            isNull(engagementassignments.taskid),
          ),
        );
      const heldIds = new Set(held.map((h) => h.projectid));
      const skipped = projects.filter((p) => heldIds.has(p.id)).map((p) => p.id);
      const toAdd = projects.filter((p) => !heldIds.has(p.id)).map((p) => p.id);

      if (toAdd.length === 0) {
        res.status(200).json({ success: true, added: [], skipped });
        return;
      }

      if (engagement.state === "paused" || engagement.state === "disabled") {
        const queued: string[] = [];
        for (const projectid of toAdd) {
          const q = await enqueueModification({
            engagementId: engagement.id,
            operationType: "ADD_ASSIGNMENT",
            payload: { scopeid: null, taskid: null, projectid },
            queuedByUserId: req.userid!,
          });
          queued.push(q.id);
        }
        res.status(202).json({
          success: true,
          applied: false,
          queued: true,
          queueIds: queued,
          projectids: toAdd,
          skipped,
          message: `Engagement is ${engagement.state}; assignments will be applied on resume/enable.`,
          engagementState: engagement.state,
        });
        return;
      }

      const now = new Date();
      const rows = toAdd.map((projectid) => ({
        id: uuidv7(),
        engagementid: engagement.id,
        scopeid: null,
        taskid: null,
        projectid,
        addedat: now,
        addedbyid: req.userid!,
      }));
      // One multi-row INSERT: all rows or none.
      await db.insert(engagementassignments).values(rows);

      // Audit each row to BOTH tenants, exactly as a single add.
      await Promise.all(
        rows.flatMap((r) => {
          const details = {
            engagementId: engagement.id,
            assignmentId: r.id,
            scopeid: null,
            taskid: null,
            projectid: r.projectid,
            bulk: "allProjects",
          };
          return [engagement.clientcompanyid, engagement.consultingcompanyid].map((companyId) =>
            logAuditEvent({
              companyId,
              userId: req.userid,
              action: "ENGAGEMENT_ASSIGNMENT_ADDED",
              resourceType: "engagementassignment",
              resourceId: r.id,
              details,
              status: "success",
            }),
          );
        }),
      );

      // FR-023: one notification for the whole bulk add.
      void notifyAssignmentsModified({
        engagementId: engagement.id,
        consultingCompanyId: engagement.consultingcompanyid,
        added: rows.map((r) => ({ scopeid: null, taskid: null, projectid: r.projectid })),
        removed: [],
        actorUserId: req.userid!,
      });

      res.status(201).json({
        success: true,
        added: rows.map((r) => ({ id: r.id, projectid: r.projectid })),
        skipped,
        addedAt: now,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Add all-projects assignments error");
      res.status(500).json({
        code: "ADD_ASSIGNMENT_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T079] END

// [SCOPE 037 / T025] BEGIN — POST /:id/assignments (add scope or task)
// MODIFIED-BY: [SCOPE 037 / T078] — duplicate check on the full (projectid, scopeid, taskid) key (FR-030)
//
// T028 note: per FR-005 AC4 the spec calls for queueing modifications during
// paused/disabled with apply-on-resume. We instead block via requireWriteAllowed
// for MVP — modifications during paused/disabled return 403 with a clear
// message. Queue behavior is a follow-up enhancement; the simpler block is
// acceptable for MVP and avoids a new pendingmodifications table.
const addAssignmentSchema = z
  .object({
    scopeid: z.string().min(1).max(32).optional(),
    taskid: z.string().uuid().optional(),
    projectid: z.string().uuid(),
  })
  .refine((d) => !(d.scopeid && d.taskid), {
    message:
      "Provide at most one of scopeid or taskid. Omit both for a whole-project grant.",
  });

router.post(
  "/:id/assignments",
  resolveEngagementContext,
  requireClientAdmin,
  validateBody(addAssignmentSchema),
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;
      const { scopeid, taskid, projectid } = req.body as z.infer<
        typeof addAssignmentSchema
      >;

      // [SCOPE 037 / T028] BEGIN — queue when non-active (FR-005 AC4)
      // Ended state is terminal — no queuing, just refuse.
      if (engagement.state === "ended") {
        res.status(403).json({
          code: "ENGAGEMENT_ENDED",
          error: "This engagement has ended; assignments cannot be added.",
        });
        return;
      }
      if (engagement.state === "paused" || engagement.state === "disabled") {
        const queued = await enqueueModification({
          engagementId: engagement.id,
          operationType: "ADD_ASSIGNMENT",
          payload: { scopeid: scopeid ?? null, taskid: taskid ?? null, projectid },
          queuedByUserId: req.userid!,
        });
        res.status(202).json({
          success: true,
          applied: false,
          queued: true,
          queueId: queued.id,
          message: `Engagement is ${engagement.state}; assignment will be applied on resume/enable.`,
          engagementState: engagement.state,
        });
        return;
      }
      // [SCOPE 037 / T028] END

      // Validate projectid belongs to the Client Company.
      const projectRows = await db
        .select({
          id: companyprojects.id,
          companyid: companyprojects.companyid,
        })
        .from(companyprojects)
        .where(eq(companyprojects.id, projectid))
        .limit(1);
      if (projectRows.length === 0) {
        res
          .status(404)
          .json({ code: "PROJECT_NOT_FOUND", error: "Project not found" });
        return;
      }
      if (projectRows[0].companyid !== engagement.clientcompanyid) {
        res.status(403).json({
          code: "PROJECT_NOT_OWNED",
          error: "Project does not belong to the Client Company",
        });
        return;
      }

      // If task-level: validate taskid belongs to projectid.
      if (taskid) {
        const taskRows = await db
          .select({
            id: projecttasks.id,
            projectid: projecttasks.projectid,
          })
          .from(projecttasks)
          .where(eq(projecttasks.id, taskid))
          .limit(1);
        if (taskRows.length === 0) {
          res
            .status(404)
            .json({ code: "TASK_NOT_FOUND", error: "Task not found" });
          return;
        }
        if (taskRows[0].projectid !== projectid) {
          res.status(400).json({
            code: "TASK_PROJECT_MISMATCH",
            error: "Task does not belong to the specified project",
          });
          return;
        }
      }

      // Idempotency: refuse if an active assignment with the same key already
      // exists on this engagement. FR-030: the key is the full
      // (projectid, scopeid, taskid); an absent scopeid/taskid matches only NULL.
      const existingConditions = [
        sqlEqU(engagementassignments.engagementid, engagement.id),
        isNull(engagementassignments.removedat),
        sqlEqU(engagementassignments.projectid, projectid),
        scopeid
          ? eq(engagementassignments.scopeid, scopeid)
          : isNull(engagementassignments.scopeid),
        taskid
          ? sqlEqU(engagementassignments.taskid, taskid)
          : isNull(engagementassignments.taskid),
      ];
      const existing = await db
        .select({ id: engagementassignments.id })
        .from(engagementassignments)
        .where(and(...existingConditions))
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({
          code: "ASSIGNMENT_ALREADY_EXISTS",
          error: "An active assignment with these identifiers already exists",
          existingId: existing[0].id,
        });
        return;
      }

      const assignmentId = uuidv7();
      const now = new Date();
      await db.insert(engagementassignments).values({
        id: assignmentId,
        engagementid: engagement.id,
        scopeid: scopeid ?? null,
        taskid: taskid ?? null,
        projectid,
        addedat: now,
        addedbyid: req.userid!,
      });

      // Audit log to BOTH tenants.
      const details = {
        engagementId: engagement.id,
        assignmentId,
        scopeid: scopeid ?? null,
        taskid: taskid ?? null,
        projectid,
      };
      await Promise.all([
        logAuditEvent({
          companyId: engagement.clientcompanyid,
          userId: req.userid,
          action: "ENGAGEMENT_ASSIGNMENT_ADDED",
          resourceType: "engagementassignment",
          resourceId: assignmentId,
          details,
          status: "success",
        }),
        logAuditEvent({
          companyId: engagement.consultingcompanyid,
          userId: req.userid,
          action: "ENGAGEMENT_ASSIGNMENT_ADDED",
          resourceType: "engagementassignment",
          resourceId: assignmentId,
          details,
          status: "success",
        }),
      ]);

      // FR-023: notify Consulting Co. ADMIN(s). MVP sends one email per
      // assignment change; true batching (one email per save form) is a
      // frontend coalescing concern and can be added later.
      void notifyAssignmentsModified({
        engagementId: engagement.id,
        consultingCompanyId: engagement.consultingcompanyid,
        added: [{ scopeid: scopeid ?? null, taskid: taskid ?? null, projectid }],
        removed: [],
        actorUserId: req.userid!,
      });

      res.status(201).json({
        success: true,
        assignmentId,
        scopeid: scopeid ?? null,
        taskid: taskid ?? null,
        projectid,
        addedAt: now,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Add assignment error");
      res.status(500).json({
        code: "ADD_ASSIGNMENT_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T025] END

// [SCOPE 037 / T026] BEGIN — DELETE /:id/assignments/:aid (soft delete)
router.delete(
  "/:id/assignments/:aid",
  resolveEngagementContext,
  requireClientAdmin,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;
      const aid = String(req.params.aid);

      // [SCOPE 037 / T028] BEGIN — queue when non-active (FR-005 AC4)
      if (engagement.state === "ended") {
        res.status(403).json({
          code: "ENGAGEMENT_ENDED",
          error: "This engagement has ended; assignments cannot be removed.",
        });
        return;
      }
      if (engagement.state === "paused" || engagement.state === "disabled") {
        const queued = await enqueueModification({
          engagementId: engagement.id,
          operationType: "REMOVE_ASSIGNMENT",
          payload: { assignmentId: aid },
          queuedByUserId: req.userid!,
        });
        res.status(202).json({
          success: true,
          applied: false,
          queued: true,
          queueId: queued.id,
          message: `Engagement is ${engagement.state}; removal will be applied on resume/enable.`,
          engagementState: engagement.state,
        });
        return;
      }
      // [SCOPE 037 / T028] END

      // Verify the assignment exists and belongs to this engagement.
      const rows = await db
        .select({
          id: engagementassignments.id,
          engagementid: engagementassignments.engagementid,
          scopeid: engagementassignments.scopeid,
          taskid: engagementassignments.taskid,
          projectid: engagementassignments.projectid,
          removedat: engagementassignments.removedat,
        })
        .from(engagementassignments)
        .where(sqlEqU(engagementassignments.id, aid))
        .limit(1);

      if (rows.length === 0) {
        res
          .status(404)
          .json({ code: "ASSIGNMENT_NOT_FOUND", error: "Assignment not found" });
        return;
      }
      if (rows[0].engagementid !== engagement.id) {
        res.status(404).json({
          code: "ASSIGNMENT_NOT_FOUND",
          error: "Assignment not found on this engagement",
        });
        return;
      }
      if (rows[0].removedat) {
        res.status(409).json({
          code: "ASSIGNMENT_ALREADY_REMOVED",
          error: "Assignment was already removed",
        });
        return;
      }

      const now = new Date();
      await db
        .update(engagementassignments)
        .set({ removedat: now, removedbyid: req.userid! })
        .where(sqlEqU(engagementassignments.id, aid));

      // Audit log to BOTH tenants.
      const details = {
        engagementId: engagement.id,
        assignmentId: aid,
        scopeid: rows[0].scopeid,
        taskid: rows[0].taskid,
        projectid: rows[0].projectid,
      };
      await Promise.all([
        logAuditEvent({
          companyId: engagement.clientcompanyid,
          userId: req.userid,
          action: "ENGAGEMENT_ASSIGNMENT_REMOVED",
          resourceType: "engagementassignment",
          resourceId: aid,
          details,
          status: "success",
        }),
        logAuditEvent({
          companyId: engagement.consultingcompanyid,
          userId: req.userid,
          action: "ENGAGEMENT_ASSIGNMENT_REMOVED",
          resourceType: "engagementassignment",
          resourceId: aid,
          details,
          status: "success",
        }),
      ]);

      // FR-023: notify Consulting Co. on removal too.
      void notifyAssignmentsModified({
        engagementId: engagement.id,
        consultingCompanyId: engagement.consultingcompanyid,
        added: [],
        removed: [
          {
            scopeid: rows[0].scopeid,
            taskid: rows[0].taskid,
            projectid: rows[0].projectid,
          },
        ],
        actorUserId: req.userid!,
      });

      res.json({
        success: true,
        assignmentId: aid,
        removedAt: now,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Remove assignment error");
      res.status(500).json({
        code: "REMOVE_ASSIGNMENT_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T026] END

// ─── Sub-Assignments (Phase 6) ──────────────────────────────────────────────
//
// Sub-assignments are the Consulting Company's internal distribution of an
// Engagement Assignment to its own members. Not visible to the Client side
// (FR-009 AC3); these endpoints reject Client-side callers.

// [SCOPE 037 / T029] BEGIN — GET /:id/subassignments
router.get(
  "/:id/subassignments",
  resolveEngagementContext,
  requireConsultingSide,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;
      const includeRemoved = req.query.includeRemoved === "true";

      const conditions = [
        sqlEqU(engagementassignments.engagementid, engagement.id),
      ];
      if (!includeRemoved) {
        conditions.push(isNull(subassignments.removedat));
      }

      const rows = await db
        .select({
          id: subassignments.id,
          engagementassignmentid: subassignments.engagementassignmentid,
          consultingmemberid: subassignments.consultingmemberid,
          assignedat: subassignments.assignedat,
          assignedbyid: subassignments.assignedbyid,
          removedat: subassignments.removedat,
          memberfullname: userprofiles.fullname,
          memberactive: userprofiles.active,
          memberemail: userprofiles.emailaddr,
          scopeid: engagementassignments.scopeid,
          taskid: engagementassignments.taskid,
          projectid: engagementassignments.projectid,
          assignmentremovedat: engagementassignments.removedat,
        })
        .from(subassignments)
        .innerJoin(
          engagementassignments,
          eq(subassignments.engagementassignmentid, engagementassignments.id),
        )
        .innerJoin(
          userprofiles,
          eq(subassignments.consultingmemberid, userprofiles.id),
        )
        .where(and(...conditions));

      res.json({
        engagementId: engagement.id,
        subassignments: rows,
        total: rows.length,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "List sub-assignments error");
      res.status(500).json({
        code: "LIST_SUBASSIGNMENTS_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T029] END

// [SCOPE 037 / T030] BEGIN — POST /:id/assignments/:aid/subassign
const subassignSchema = z.object({
  consultingmemberid: z.string().uuid(),
});

router.post(
  "/:id/assignments/:aid/subassign",
  resolveEngagementContext,
  requireConsultingAdminOrManager,
  requireWriteAllowed,
  validateBody(subassignSchema),
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;
      const aid = String(req.params.aid);
      const { consultingmemberid } = req.body as z.infer<
        typeof subassignSchema
      >;

      // Verify assignment exists, belongs to this engagement, and is active.
      const assignRows = await db
        .select({
          id: engagementassignments.id,
          engagementid: engagementassignments.engagementid,
          removedat: engagementassignments.removedat,
        })
        .from(engagementassignments)
        .where(sqlEqU(engagementassignments.id, aid))
        .limit(1);
      if (assignRows.length === 0) {
        res.status(404).json({
          code: "ASSIGNMENT_NOT_FOUND",
          error: "Assignment not found",
        });
        return;
      }
      if (assignRows[0].engagementid !== engagement.id) {
        res.status(404).json({
          code: "ASSIGNMENT_NOT_FOUND",
          error: "Assignment not found on this engagement",
        });
        return;
      }
      if (assignRows[0].removedat) {
        res.status(409).json({
          code: "ASSIGNMENT_REMOVED",
          error: "Cannot sub-assign a removed assignment",
        });
        return;
      }

      // Verify the Consulting Member belongs to this Consulting Company + active.
      const memberRows = await db
        .select({
          id: userprofiles.id,
          companyid: userprofiles.companyid,
          active: userprofiles.active,
        })
        .from(userprofiles)
        .where(eq(userprofiles.id, consultingmemberid))
        .limit(1);
      if (memberRows.length === 0) {
        res
          .status(404)
          .json({ code: "MEMBER_NOT_FOUND", error: "Member not found" });
        return;
      }
      if (memberRows[0].companyid !== engagement.consultingcompanyid) {
        res.status(403).json({
          code: "MEMBER_NOT_IN_CONSULTING_COMPANY",
          error:
            "Member does not belong to the Consulting Company on this engagement",
        });
        return;
      }
      if (!memberRows[0].active) {
        res.status(409).json({
          code: "MEMBER_INACTIVE",
          error: "Cannot sub-assign to an inactive member",
        });
        return;
      }

      // Idempotency: refuse if an active sub-assignment already exists for this
      // (assignment, member) pair.
      const existing = await db
        .select({ id: subassignments.id })
        .from(subassignments)
        .where(
          and(
            sqlEqU(subassignments.engagementassignmentid, aid),
            sqlEqU(subassignments.consultingmemberid, consultingmemberid),
            isNull(subassignments.removedat),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({
          code: "SUBASSIGNMENT_ALREADY_EXISTS",
          error:
            "This member is already actively sub-assigned to this assignment",
          existingId: existing[0].id,
        });
        return;
      }

      const subId = uuidv7();
      const now = new Date();
      await db.insert(subassignments).values({
        id: subId,
        engagementassignmentid: aid,
        consultingmemberid,
        assignedat: now,
        assignedbyid: req.userid!,
      });

      // Audit logged on Consulting Co. tenant ONLY (FR-009 AC3 — confidentiality).
      await logAuditEvent({
        companyId: engagement.consultingcompanyid,
        userId: req.userid,
        action: "SUBASSIGNMENT_CREATED",
        resourceType: "subassignment",
        resourceId: subId,
        details: {
          engagementId: engagement.id,
          engagementAssignmentId: aid,
          consultingMemberId: consultingmemberid,
        },
        status: "success",
      });

      res.status(201).json({
        success: true,
        subassignmentId: subId,
        engagementAssignmentId: aid,
        consultingMemberId: consultingmemberid,
        assignedAt: now,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Subassign error");
      res.status(500).json({
        code: "SUBASSIGN_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T030] END

// [SCOPE 037 / T031] BEGIN — DELETE /:id/subassignments/:sid (soft delete)
router.delete(
  "/:id/subassignments/:sid",
  resolveEngagementContext,
  requireConsultingAdminOrManager,
  requireWriteAllowed,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;
      const sid = String(req.params.sid);

      const rows = await db
        .select({
          id: subassignments.id,
          engagementassignmentid: subassignments.engagementassignmentid,
          consultingmemberid: subassignments.consultingmemberid,
          removedat: subassignments.removedat,
          engagementid: engagementassignments.engagementid,
        })
        .from(subassignments)
        .innerJoin(
          engagementassignments,
          eq(subassignments.engagementassignmentid, engagementassignments.id),
        )
        .where(sqlEqU(subassignments.id, sid))
        .limit(1);

      if (rows.length === 0) {
        res.status(404).json({
          code: "SUBASSIGNMENT_NOT_FOUND",
          error: "Sub-assignment not found",
        });
        return;
      }
      if (rows[0].engagementid !== engagement.id) {
        res.status(404).json({
          code: "SUBASSIGNMENT_NOT_FOUND",
          error: "Sub-assignment not found on this engagement",
        });
        return;
      }
      if (rows[0].removedat) {
        res.status(409).json({
          code: "SUBASSIGNMENT_ALREADY_REMOVED",
          error: "Sub-assignment was already removed",
        });
        return;
      }

      const now = new Date();
      await db
        .update(subassignments)
        .set({ removedat: now, removedbyid: req.userid! })
        .where(sqlEqU(subassignments.id, sid));

      await logAuditEvent({
        companyId: engagement.consultingcompanyid,
        userId: req.userid,
        action: "SUBASSIGNMENT_REMOVED",
        resourceType: "subassignment",
        resourceId: sid,
        details: {
          engagementId: engagement.id,
          engagementAssignmentId: rows[0].engagementassignmentid,
          consultingMemberId: rows[0].consultingmemberid,
        },
        status: "success",
      });

      res.json({ success: true, subassignmentId: sid, removedAt: now });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Remove sub-assignment error");
      res.status(500).json({
        code: "REMOVE_SUBASSIGNMENT_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T031] END

// [SCOPE 037 / T032] BEGIN — GET /:id/needsreassignment (queue)
//
// T033 note: The cascade is computed at READ time by joining sub-assignments
// against userprofiles and filtering where the member is now inactive. This
// avoids needing a DB trigger or app-level hook on the user-deactivation flow
// (which lives in another scope). When a member is deactivated elsewhere,
// their open sub-assignments automatically appear in this queue on the next read.
router.get(
  "/:id/needsreassignment",
  resolveEngagementContext,
  requireConsultingSide,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;

      const rows = await db
        .select({
          subassignmentId: subassignments.id,
          engagementassignmentid: subassignments.engagementassignmentid,
          consultingmemberid: subassignments.consultingmemberid,
          memberfullname: userprofiles.fullname,
          memberemail: userprofiles.emailaddr,
          assignedat: subassignments.assignedat,
          scopeid: engagementassignments.scopeid,
          taskid: engagementassignments.taskid,
          projectid: engagementassignments.projectid,
        })
        .from(subassignments)
        .innerJoin(
          engagementassignments,
          eq(subassignments.engagementassignmentid, engagementassignments.id),
        )
        .innerJoin(
          userprofiles,
          eq(subassignments.consultingmemberid, userprofiles.id),
        )
        .where(
          and(
            sqlEqU(engagementassignments.engagementid, engagement.id),
            isNull(subassignments.removedat),
            isNull(engagementassignments.removedat),
            eq(userprofiles.active, false),
          ),
        );

      res.json({
        engagementId: engagement.id,
        queue: rows,
        total: rows.length,
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Needs reassignment error");
      res.status(500).json({
        code: "NEEDS_REASSIGNMENT_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T032] END

// ─── Billing + B2B Invoice (Phase 8) ─────────────────────────────────────────

/**
 * Helper: build a SQL fragment matching the set of tasks covered by an
 * engagement's active assignments (both task-level and scope-level grants).
 * Joins through projectspecifications.specnumber for the scope-level branch.
 */
// [SCOPE 037 / T039] BEGIN — coveredTasksQuery helper
// MODIFIED-BY [SCOPE 037 / FR-006-amendment] 2026-05-27 — project-level grants
function coveredTasksClause(engagementId: string) {
  return sql`(
    SELECT taskid AS id
    FROM engagementassignments
    WHERE engagementid = ${engagementId}
      AND taskid IS NOT NULL
      AND removedat IS NULL
    UNION
    SELECT t.id
    FROM projecttasks t
    INNER JOIN projectspecifications s ON s.id = t.specid
    WHERE s.specnumber IN (
      SELECT scopeid FROM engagementassignments
      WHERE engagementid = ${engagementId}
        AND scopeid IS NOT NULL
        AND removedat IS NULL
    )
    UNION
    SELECT t.id
    FROM projecttasks t
    WHERE t.projectid IN (
      SELECT projectid FROM engagementassignments
      WHERE engagementid = ${engagementId}
        AND scopeid IS NULL
        AND taskid IS NULL
        AND removedat IS NULL
    )
  )`;
}
// [SCOPE 037 / T039] END

// [SCOPE 037 / T039] BEGIN — GET /:id/billing (Client-side aggregate)
//
// FR-016: aggregate-only. Members count + total hours + total $. No per-member,
// per-task, or per-day breakdown is exposed. Time entries are read from the
// CONSULTING tenant (filter by te.companyid = engagement.consultingcompanyid).
router.get(
  "/:id/billing",
  resolveEngagementContext,
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;
      const window = (req.query.window as string) ?? "engagement-to-date";

      let windowStart: Date | null = null;
      let windowEnd: Date | null = null;
      const now = new Date();
      if (window === "this-month") {
        windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
        windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      } else if (window === "last-month") {
        windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        windowEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const dateFilter = windowStart
        ? sql`AND te.starttime >= ${windowStart.toISOString()} AND te.starttime < ${windowEnd!.toISOString()}`
        : sql``;

      const rows = await db.execute(sql`
        SELECT
          COUNT(DISTINCT te.userid)::int AS membercount,
          COALESCE(SUM(te.duration), 0)::int AS totalminutes,
          COALESCE(SUM((te.duration::numeric / 60.0) * te.entryrate), 0)::numeric AS totaldollars
        FROM projecttimeentries te
        WHERE te.taskid IN ${coveredTasksClause(engagement.id)}
          AND te.companyid = ${engagement.consultingcompanyid}
          AND te.billable = true
          ${dateFilter}
      `);

      // drizzle's db.execute returns { rows: [...] } for pg; result shape per driver.
      // We expect a single aggregate row.
      const rowsAny = rows as unknown as { rows?: Array<Record<string, unknown>> };
      const r = rowsAny.rows?.[0] ?? (rows as unknown as Array<Record<string, unknown>>)[0] ?? {};
      const memberCount = Number(r.membercount ?? 0);
      const totalMinutes = Number(r.totalminutes ?? 0);
      const totalDollars = Number(r.totaldollars ?? 0);

      res.json({
        engagementId: engagement.id,
        window,
        windowStart,
        windowEnd,
        memberCount,
        totalHours: Number((totalMinutes / 60).toFixed(2)),
        totalDollars: Number(totalDollars.toFixed(2)),
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Billing aggregate error");
      res.status(500).json({
        code: "BILLING_AGGREGATE_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T039] END

// [SCOPE 037 / T041] BEGIN — POST /:id/invoice (B2B generation, Consulting ADMIN only)
const generateInvoiceSchema = z.object({
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  description: z.string().max(1000).optional(),
});

router.post(
  "/:id/invoice",
  resolveEngagementContext,
  requireConsultingSide,
  validateBody(generateInvoiceSchema),
  async (req: EngagementAuthRequest, res: Response): Promise<void> => {
    try {
      const { engagement } = req.engagementContext!;

      if (req.usertype !== "ADMIN") {
        res.status(403).json({
          code: "CONSULTING_ADMIN_REQUIRED",
          error:
            "Only the Consulting Company's ADMIN can generate B2B invoices",
        });
        return;
      }

      // T043 — fail-fast on empty Client billingemail.
      const clientRows = await db
        .select({
          id: companies.id,
          name: companies.name,
          billingemail: companies.billingemail,
        })
        .from(companies)
        .where(eq(companies.id, engagement.clientcompanyid))
        .limit(1);
      if (clientRows.length === 0) {
        res.status(404).json({
          code: "CLIENT_NOT_FOUND",
          error: "Client Company not found",
        });
        return;
      }
      if (!clientRows[0].billingemail) {
        res.status(400).json({
          code: "CLIENT_BILLING_EMAIL_MISSING",
          error:
            "Client Company has no billingemail set; cannot deliver invoice. Ask the Client ADMIN to set one in Company settings.",
        });
        return;
      }

      const { windowStart, windowEnd, description } = req.body as z.infer<
        typeof generateInvoiceSchema
      >;

      // Aggregate the billable + uninvoiced time entries within the window.
      const start = windowStart ? new Date(windowStart) : null;
      const end = windowEnd ? new Date(windowEnd) : null;
      const dateFilter = start
        ? sql`AND te.starttime >= ${start.toISOString()} AND te.starttime < ${end!.toISOString()}`
        : sql``;

      const result = await db.execute(sql`
        SELECT
          COALESCE(SUM(te.duration), 0)::int AS totalminutes,
          COALESCE(SUM((te.duration::numeric / 60.0) * te.entryrate), 0)::numeric AS totaldollars
        FROM projecttimeentries te
        WHERE te.taskid IN ${coveredTasksClause(engagement.id)}
          AND te.companyid = ${engagement.consultingcompanyid}
          AND te.billable = true
          AND te.invoiced = false
          ${dateFilter}
      `);
      const rowsAny = result as unknown as { rows?: Array<Record<string, unknown>> };
      const r =
        rowsAny.rows?.[0] ??
        (result as unknown as Array<Record<string, unknown>>)[0] ??
        {};
      const totalMinutes = Number(r.totalminutes ?? 0);
      const totalDollars = Number(r.totaldollars ?? 0);

      if (totalMinutes === 0) {
        res.status(409).json({
          code: "NOTHING_TO_INVOICE",
          error:
            "No uninvoiced billable time exists for the engagement in this window",
        });
        return;
      }

      // Create the invoice row in the Consulting Co.'s tenant.
      const invoiceId = uuidv7();
      const invoiceNumber = `ENG-${engagement.id.slice(0, 8)}-${Date.now()}`;
      const hoursWorked = Number((totalMinutes / 60).toFixed(2));

      await db.insert(projectinvoices).values({
        id: invoiceId,
        projectid: null, // Engagements span multiple projects (FR-007).
        companyid: engagement.consultingcompanyid,
        clientemail: clientRows[0].billingemail,
        invoicenumber: invoiceNumber,
        billedto: clientRows[0].name,
        totalamount: String(totalDollars),
        hoursworked: String(hoursWorked),
        description:
          description ??
          `B2B engagement invoice for engagement ${engagement.id}${
            start && end ? ` (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)})` : ""
          }`,
      });

      // Mark covered, billable, uninvoiced time entries within the window as invoiced.
      await db.execute(sql`
        UPDATE projecttimeentries
        SET invoiced = true, invoicedat = NOW()
        WHERE taskid IN ${coveredTasksClause(engagement.id)}
          AND companyid = ${engagement.consultingcompanyid}
          AND billable = true
          AND invoiced = false
          ${dateFilter}
      `);

      // T042: delivery with one-shot retry. Full DLQ + exponential backoff is
      // a follow-up — for MVP a single retry covers transient SMTP failures.
      let delivered = false;
      let lastError: string | null = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await sendEmail(
            clientRows[0].billingemail,
            `Invoice ${invoiceNumber} from ${
              (
                await db
                  .select({ name: companies.name })
                  .from(companies)
                  .where(eq(companies.id, engagement.consultingcompanyid))
                  .limit(1)
              )[0]?.name ?? "Your consulting partner"
            }`,
            `<p>Invoice <strong>${invoiceNumber}</strong> attached.</p>
             <p>Total: <strong>$${totalDollars.toFixed(2)}</strong> for ${hoursWorked.toFixed(2)} hours.</p>
             <p>Reference: engagement ${engagement.id}</p>`,
            `Invoice ${invoiceNumber}\nTotal: $${totalDollars.toFixed(2)} for ${hoursWorked.toFixed(2)} hours.\nReference: engagement ${engagement.id}`,
          );
          delivered = true;
          break;
        } catch (sendErr) {
          lastError =
            sendErr instanceof Error ? sendErr.message : String(sendErr);
          logger.warn(
            { invoiceId, attempt, error: lastError },
            "Invoice email send attempt failed",
          );
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (delivered) {
        await db
          .update(projectinvoices)
          .set({ emailsent: true, sentat: new Date() })
          .where(eq(projectinvoices.id, invoiceId));
      } else {
        logger.error(
          { invoiceId, lastError },
          "Invoice email delivery FAILED after retries — DLQ follow-up",
        );
      }

      res.status(201).json({
        success: true,
        invoiceId,
        invoiceNumber,
        totalAmount: totalDollars,
        hoursWorked,
        billedTo: clientRows[0].name,
        deliveredEmail: delivered,
        // Operator visibility on transient failure without leaking sensitive details.
        deliveryError: delivered ? null : "delivery failed after retry",
      });
    } catch (error) {
      const expanded = expandError(error);
      logger.error({ error: expanded }, "Generate B2B invoice error");
      res.status(500).json({
        code: "INVOICE_ERROR",
        error: expanded.message,
        details: expanded,
      });
    }
  },
);
// [SCOPE 037 / T041] END

export default router;
