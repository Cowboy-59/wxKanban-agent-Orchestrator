import { Router, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../db/client.js";
import {
  emailverificationtokens,
  passwordresettokens,
  userprofiles,
} from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  signInUser,
  getCurrentUser,
  AccountLockedError,
} from "../services/userService.js";
import { registerCompany } from "../services/RegistrationService.js";
import { agentDeviceTokenService } from "../services/AgentDeviceTokenService.js"; // [SCOPE 152 / T005]
import { signToken } from "../lib/jwt.js";
import { validateBody } from "../middleware/validation.js";
import { signupInviteRateLimit } from "../middleware/rateLimit.js"; // [SCOPE 023 / T111]
import { DEFAULT_LOCALE, resolveSupportedLocale } from "~/shared/locales.js"; // [SCOPE 051]
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { sendEmail } from "../lib/email.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { presignAvatarUpload, isMarketingAssetUrl } from "../lib/marketing-assets-s3.js"; // [profile self-service]
import {
  getVerificationEmailHTML,
  getVerificationEmailText,
  getPasswordResetEmailHTML,
  getPasswordResetEmailText,
} from "../lib/emailTemplates.js";

const router = Router();
const logger = createLogger("auth-routes");

const registerSchema = z.object({
  adminEmail: z.string().email("Invalid email format"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  adminFirstName: z.string().optional(),
  adminLastName: z.string().optional(),
  companyName: z.string().min(2, "Company name required"),
  billingEmail: z.string().email().optional(),
  billingAddress: z.string().optional(),
  billingCountry: z.string().optional(),
  billingPhone: z.string().optional(),
  subscriptionTier: z
    .enum(["FREE", "SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"])
    .optional()
    .default("SINGLE_USER"),
  // Optional Stripe identifiers from POST /payment/registration/subscribe.
  // When present the registration pipeline inserts a companysubscriptions row
  // and creates the company in PENDING status pending webhook confirmation.
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  appliedPromoDays: z.number().int().min(0).max(365).optional(),
  // [SCOPE 064 / T010] Amendment A — newsletter opt-in at signup (default subscribed).
  newsletterOptIn: z.boolean().optional(),
  // [SCOPE 088 / T003] Optional referral code entered by a customer at signup (FR-007).
  // Note: `distributor` is intentionally NOT accepted here — it is gated to
  // POST /register-distributor so the public wizard cannot self-grant a FREE account.
  referredBy: z.string().max(16).optional(),
  // [SCOPE 023 / T109] Signup-invitation token (FR-002a). Same posture as
  // `distributor` above: the token is only an opaque lookup key — the promo
  // duration and plan it confers are read server-side from signupinvitations and
  // can never be asserted by the client (FR-002b). Registration is rejected
  // unless adminEmail matches the invited address.
  inviteToken: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid invitation").optional(),
});

// [SCOPE 088 / T003] BEGIN — Distributor self-onboarding schema (FR-002)
const registerDistributorSchema = z.object({
  adminEmail: z.string().email("Invalid email format"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  adminFirstName: z.string().optional(),
  companyName: z.string().min(2, "Business name required"),
});
// [SCOPE 088 / T003] END

const signInSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /auth/register
 * Register a new company + admin user.
 * All users must belong to a company — standalone registration removed.
 */
router.post(
  "/register",
  // [SCOPE 023 / T111] This endpoint had no rate limit at all. It is the
  // redemption point for signup invitations (FR-002a), so it is now the place a
  // token would be brute-forced or a burn replayed.
  signupInviteRateLimit,
  validateBody(registerSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        companyName,
        billingEmail,
        billingAddress,
        billingCountry,
        billingPhone,
        subscriptionTier,
        adminEmail,
        adminPassword,
        adminFirstName,
        adminLastName,
        stripeCustomerId,
        stripeSubscriptionId,
        appliedPromoDays,
        referredBy,
        newsletterOptIn,
        inviteToken,
      } = req.body;

      const resolvedFirstName = adminFirstName ?? adminEmail.split("@")[0];
      const tier = subscriptionTier ?? "SINGLE_USER";

      const result = await registerCompany({
        companyName,
        billingEmail: billingEmail ?? adminEmail,
        billingAddress: billingAddress ?? "",
        billingCountry: billingCountry ?? "US",
        billingPhone: billingPhone ?? "",
        subscriptionTier: tier,
        stripeCustomerId,
        stripeSubscriptionId,
        appliedPromoDays,
        referredBy, // [SCOPE 088 / T003] attribution (FR-008)
        newsletterOptIn, // [SCOPE 064 / T010] Amendment A
        inviteToken, // [SCOPE 023 / T109] invite-bound promo (FR-002a)
        adminEmail,
        adminPassword,
        adminFirstName: resolvedFirstName,
        adminLastName,
      });

      const token = signToken(result.admin.userId, adminEmail, {
        companyid: result.company.companyId,
        usertype: "ADMIN",
        billingplan: result.company.subscriptionTier,
        subscriptionstatus: result.company.subscriptionStatus,
        maxusers: result.company.maxUsers,
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      });

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error("JWT_SECRET environment variable is not set");
      const verificationToken = jwt.sign(
        { email: adminEmail, purpose: "email-verification" },
        jwtSecret,
        { expiresIn: "24h" }
      );
      const verificationTokenHash = crypto.createHash("sha256").update(verificationToken).digest("hex");
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      db.insert(emailverificationtokens).values({
        tokenhash: verificationTokenHash,
        expiresat: verificationExpiresAt,
        userid: result.admin.userId,
        attemptcount: 0,
      }).then(() => {
        const verificationLink = `${process.env.CLIENT_URL || "http://localhost:3000"}/verify-email?token=${verificationToken}`;
        return sendEmail(
          adminEmail,
          "Verify Your Email - wxKanban",
          getVerificationEmailHTML(verificationLink, adminEmail),
          getVerificationEmailText(verificationLink, adminEmail)
        );
      }).catch((err: unknown) => logger.error({ err }, "Failed to send verification email after registration"));

      return res.status(201).json({
        success: true,
        message: "Company registered successfully",
        userid: result.admin.userId,
        email: result.admin.email,
        usertype: "ADMIN",
        companyid: result.company.companyId,
        billingplan: result.company.subscriptionTier,
        subscriptionstatus: result.company.subscriptionStatus,
        seatslimit: result.company.maxUsers,
        seatsused: 1,
        company: result.company,
        admin: {
          userId: result.admin.userId,
          email: result.admin.email,
          status: result.admin.status,
        },
        nextStep: result.nextStep,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      logger.error({ error: message }, "Registration error");

      // [SCOPE 023 / T109] BEGIN — invitation rejections are the caller's fault,
      // not a server fault: map them to 4xx with a code the wizard can act on.
      // Naming the reason is safe here (unlike the anonymous resolve endpoint):
      // the caller already holds the token, so this leaks nothing they lack.
      if (message.startsWith("INVITE_")) {
        const inviteErrors: Record<string, { status: number; error: string }> = {
          INVITE_EMAIL_MISMATCH: {
            status: 403,
            error: "This invitation is for a different email address.",
          },
          INVITE_ALREADY_REDEEMED: {
            status: 409,
            error: "This invitation has already been used.",
          },
          INVITE_REVOKED: {
            status: 409,
            error: "This invitation has been revoked.",
          },
          INVITE_EXPIRED: {
            status: 409,
            error: "This invitation has expired.",
          },
          INVITE_NOT_FOUND: {
            status: 404,
            error: "This invitation is not valid.",
          },
        };
        const mapped = inviteErrors[message] ?? {
          status: 400,
          error: "This invitation is not valid.",
        };
        return res
          .status(mapped.status)
          .json({ error: mapped.error, code: message });
      }
      // [SCOPE 023 / T109] END

      if (message.includes("already exists") || message.includes("already registered")) {
        return res.status(409).json({ error: message });
      } else if (message.includes("Validation failed") || message.includes("validation failed")) {
        return res.status(400).json({ error: message });
      } else {
        return res.status(500).json({ error: "Registration failed" });
      }
    }
  },
);

// [SCOPE 088 / T003] BEGIN — POST /auth/register-distributor (FR-001, FR-003, FR-009)
/**
 * Distributor self-onboarding via the unlisted /distributor-signup page.
 * Provisions a FREE single-user account flagged distributor=true with a generated
 * referral code (returned so the page can reveal it). The `distributor` flag is
 * set server-side here and is NOT accepted on the public /register route, so the
 * normal wizard cannot self-grant a FREE account.
 */
router.post(
  "/register-distributor",
  validateBody(registerDistributorSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { companyName, adminEmail, adminPassword, adminFirstName } = req.body;
      const resolvedFirstName = adminFirstName ?? adminEmail.split("@")[0];

      const result = await registerCompany({
        companyName,
        billingEmail: adminEmail,
        billingAddress: "",
        billingCountry: "US",
        billingPhone: "",
        subscriptionTier: "FREE",
        distributor: true,
        adminEmail,
        adminPassword,
        adminFirstName: resolvedFirstName,
      });

      const token = signToken(result.admin.userId, adminEmail, {
        companyid: result.company.companyId,
        usertype: "ADMIN",
        billingplan: result.company.subscriptionTier,
        subscriptionstatus: result.company.subscriptionStatus,
        maxusers: result.company.maxUsers,
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.status(201).json({
        success: true,
        message: "Distributor registered successfully",
        userid: result.admin.userId,
        email: result.admin.email,
        usertype: "ADMIN",
        companyid: result.company.companyId,
        billingplan: result.company.subscriptionTier,
        subscriptionstatus: result.company.subscriptionStatus,
        distributor: result.company.distributor,
        referralCode: result.company.referralCode,
        nextStep: result.nextStep,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      logger.error({ error: message }, "Distributor registration error");

      if (message.includes("already exists") || message.includes("already registered")) {
        return res.status(409).json({ error: message });
      } else if (message.includes("Validation failed") || message.includes("validation failed")) {
        return res.status(400).json({ error: message });
      } else {
        return res.status(500).json({ error: "Registration failed" });
      }
    }
  },
);
// [SCOPE 088 / T003] END

/**
 * POST /auth/signin
 */
router.post(
  "/signin",
  validateBody(signInSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await signInUser({
        email: req.body.email,
        password: req.body.password,
        acceptLanguage: req.headers["accept-language"], // [SCOPE 051] first-login seeding
      });

      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign in failed";
      // 423 Locked for an active account lockout (M-12); 401 for bad credentials.
      const status = error instanceof AccountLockedError ? 423 : 401;
      logger.warn({ error: message, status }, "Sign in error");
      return res.status(status).json({ error: message });
    }
  },
);

/**
 * POST /auth/signout
 */
router.post("/signout", (_req: AuthRequest, res: Response) => {
  // clearCookie only removes the cookie when its attributes match those used
  // when it was set (see signin/register). Without matching secure/sameSite/path,
  // browsers keep the httpOnly token cookie and the user stays authenticated.
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
  res.status(200).json({ message: "Signed out successfully" });
});

/**
 * GET /auth/me
 */
router.get(
  "/me",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const result = await getCurrentUser(req.userid);
      return res.status(200).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get user";
      logger.error({ error: message }, "Get user error");
      return res.status(404).json({ error: message });
    }
  },
);

/**
 * PATCH /auth/profile
 * [SCOPE 051 / FR-004] Update the authenticated user's own profile preferences
 * (timezone, language) and return the refreshed user. Language is constrained to
 * the supported-locale set. Returns { success, user } so the client can setUser.
 */
router.patch(
  "/profile",
  authenticateToken,
  requireAuth,
  validateBody(
    z.object({
      fullname: z.string().max(80).optional(),
      timezone: z.string().max(50).optional(),
      language: z.string().max(10).optional(),
      tracktime: z.boolean().optional(),
      // [SCOPE 064 / T010] Amendment A — newsletter opt-in toggles (true = subscribed).
      newsletterupdates: z.boolean().optional(),
      newsletterpromos: z.boolean().optional(),
      // [profile self-service] job title/role, chat-on-login, and photo removal
      // (avatarurl set via the upload endpoint; here only accept null to clear it).
      responsibility: z.string().max(255).optional(),
      startchat: z.boolean().optional(),
      avatarurl: z.string().max(1024).nullable().optional(),
    }),
  ),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const {
        fullname,
        timezone,
        language,
        tracktime,
        newsletterupdates,
        newsletterpromos,
        responsibility,
        startchat,
        avatarurl,
      } = req.body as {
        fullname?: string;
        timezone?: string;
        language?: string;
        tracktime?: boolean;
        newsletterupdates?: boolean;
        newsletterpromos?: boolean;
        responsibility?: string;
        startchat?: boolean;
        avatarurl?: string | null;
      };

      const updates: Record<string, unknown> = {};
      if (fullname !== undefined) updates.fullname = fullname;
      if (timezone !== undefined) updates.timezone = timezone;
      if (tracktime !== undefined) updates.tracktime = tracktime;
      // [profile self-service]
      if (responsibility !== undefined) updates.responsibility = responsibility;
      if (startchat !== undefined) updates.startchat = startchat;
      // Only allow clearing the photo here (null); setting is done by the upload route.
      if (avatarurl === null) updates.avatarurl = null;
      // [SCOPE 064 / T010] subscribed → NULL opt-out; unsubscribed → now().
      if (newsletterupdates !== undefined)
        updates.updatesunsubscribedat = newsletterupdates ? null : new Date();
      if (newsletterpromos !== undefined)
        updates.promosunsubscribedat = newsletterpromos ? null : new Date();
      if (language !== undefined) {
        updates.language = resolveSupportedLocale(language) ?? DEFAULT_LOCALE;
      }

      if (Object.keys(updates).length > 0) {
        await db.update(userprofiles).set(updates).where(eq(userprofiles.id, req.userid));
      }

      const user = await getCurrentUser(req.userid);
      return res.status(200).json({ success: true, user });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update profile";
      logger.error({ error: message }, "Update profile error");
      return res.status(500).json({ error: message });
    }
  },
);

// [profile self-service] BEGIN — avatar upload (presigned browser→S3) + persist
/**
 * POST /auth/profile/avatar/presign — issue a short-TTL presigned PUT so the browser
 * uploads the image straight to S3 (bytes never transit the API, so they aren't bound
 * by the JSON body limit). Returns { uploadUrl, publicUrl }.
 */
router.post(
  "/profile/avatar/presign",
  authenticateToken,
  requireAuth,
  validateBody(
    z.object({
      filename: z.string().min(1).max(200),
      contentType: z.string().min(1).max(100),
      contentLength: z.number().int().positive(),
    }),
  ),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) return res.status(401).json({ error: "Authentication required" });
      const { filename, contentType, contentLength } = req.body as {
        filename: string;
        contentType: string;
        contentLength: number;
      };
      const result = await presignAvatarUpload({
        userId: req.userid,
        filename,
        contentType,
        contentLength,
      });
      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to presign avatar upload";
      logger.error({ error: message }, "Avatar presign error");
      return res.status(400).json({ error: message });
    }
  },
);

/**
 * POST /auth/profile/avatar — persist the uploaded photo's URL. The URL must live
 * under our managed assets domain (a user cannot point avatarurl at an arbitrary host).
 */
router.post(
  "/profile/avatar",
  authenticateToken,
  requireAuth,
  validateBody(z.object({ avatarurl: z.string().url().max(1024) })),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) return res.status(401).json({ error: "Authentication required" });
      const { avatarurl } = req.body as { avatarurl: string };
      if (!isMarketingAssetUrl(avatarurl)) {
        return res.status(400).json({ error: "Avatar URL must be an uploaded asset URL." });
      }
      await db.update(userprofiles).set({ avatarurl }).where(eq(userprofiles.id, req.userid));
      const user = await getCurrentUser(req.userid);
      return res.json({ success: true, user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save avatar";
      logger.error({ error: message }, "Avatar save error");
      return res.status(500).json({ error: message });
    }
  },
);
// [profile self-service] END

// [profile self-service] BEGIN — change login email (verify the NEW address first)
/**
 * POST /auth/profile/email — start an email change. Validates the new address is
 * well-formed, different, and unused; stores it as pendingemail; and emails a
 * verification link to the NEW address. The login email only switches when the link
 * is confirmed via POST /auth/profile/email/verify.
 */
router.post(
  "/profile/email",
  authenticateToken,
  requireAuth,
  validateBody(z.object({ newEmail: z.string().email("Invalid email address").max(80) })),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) return res.status(401).json({ error: "Authentication required" });
      const newEmail = (req.body as { newEmail: string }).newEmail.trim().toLowerCase();

      const [me] = await db
        .select()
        .from(userprofiles)
        .where(eq(userprofiles.id, req.userid))
        .limit(1);
      if (!me) return res.status(404).json({ error: "User not found" });
      if (me.emailaddr.toLowerCase() === newEmail) {
        return res.status(400).json({ error: "That is already your email address." });
      }
      const taken = await db
        .select({ id: userprofiles.id })
        .from(userprofiles)
        .where(eq(userprofiles.emailaddr, newEmail))
        .limit(1);
      if (taken.length > 0) {
        return res.status(409).json({ error: "That email address is already in use." });
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error("JWT_SECRET environment variable is not set");
      const token = jwt.sign(
        { userid: req.userid, newEmail, purpose: "email-change" },
        jwtSecret,
        { expiresIn: "24h" },
      );
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.insert(emailverificationtokens).values({
        tokenhash: tokenHash,
        expiresat: expiresAt,
        userid: req.userid,
        attemptcount: 0,
      });
      await db
        .update(userprofiles)
        .set({ pendingemail: newEmail })
        .where(eq(userprofiles.id, req.userid));

      const link = `${process.env.CLIENT_URL || "http://localhost:3000"}/verify-email-change?token=${token}`;
      await sendEmail(
        newEmail,
        "Confirm your new email - wxKanban",
        getVerificationEmailHTML(link, newEmail),
        getVerificationEmailText(link, newEmail),
      );

      logger.info({ userid: req.userid }, "Email-change verification sent");
      return res.json({ success: true, pendingemail: newEmail });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start email change";
      logger.error({ error: message }, "Email-change request error");
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /auth/profile/email/verify — confirm an email change from the emailed token.
 * Re-checks uniqueness at swap time, then switches emailaddr and clears pendingemail.
 * Public: the link is clicked from an email (possibly unauthenticated) — trust comes
 * from the signed token, not the session.
 */
router.post(
  "/profile/email/verify",
  validateBody(z.object({ token: z.string().min(1) })),
  async (req: AuthRequest, res: Response) => {
    try {
      const { token } = req.body as { token: string };
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error("JWT_SECRET environment variable is not set");
      let decoded: { userid?: string; newEmail?: string; purpose?: string };
      try {
        decoded = jwt.verify(token, jwtSecret) as typeof decoded;
      } catch {
        return res.status(401).json({ error: "Invalid or expired link" });
      }
      if (decoded.purpose !== "email-change" || !decoded.userid || !decoded.newEmail) {
        return res.status(401).json({ error: "Invalid token purpose" });
      }
      const newEmail = decoded.newEmail.toLowerCase();

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const [rec] = await db
        .select()
        .from(emailverificationtokens)
        .where(eq(emailverificationtokens.tokenhash, tokenHash))
        .limit(1);
      if (!rec) return res.status(401).json({ error: "Link already used or not found" });
      if (new Date() > rec.expiresat) return res.status(401).json({ error: "Link expired" });

      // Re-check uniqueness at swap time — someone else may have claimed it meanwhile.
      const taken = await db
        .select({ id: userprofiles.id })
        .from(userprofiles)
        .where(eq(userprofiles.emailaddr, newEmail))
        .limit(1);
      if (taken.length > 0 && taken[0].id !== decoded.userid) {
        return res.status(409).json({ error: "That email address is now in use." });
      }

      await db
        .update(userprofiles)
        .set({ emailaddr: newEmail, pendingemail: null })
        .where(eq(userprofiles.id, decoded.userid));
      await db
        .delete(emailverificationtokens)
        .where(eq(emailverificationtokens.id, rec.id));

      logger.info({ userid: decoded.userid }, "Email change confirmed");
      return res.json({ success: true, email: newEmail });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to confirm email change";
      logger.error({ error: message }, "Email-change verify error");
      return res.status(500).json({ error: message });
    }
  },
);
// [profile self-service] END

/**
 * POST /auth/change-password
 * Authenticated self-service password change. Verifies the current password, then
 * updates to the new one. (The Settings page already called this; the route was
 * previously missing — added alongside spec 051.)
 */
router.post(
  "/change-password",
  authenticateToken,
  requireAuth,
  validateBody(
    z.object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
    }),
  ),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };

      const rows = await db
        .select({ id: userprofiles.id, password: userprofiles.password })
        .from(userprofiles)
        .where(eq(userprofiles.id, req.userid))
        .limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const valid = await verifyPassword(currentPassword, rows[0].password);
      if (!valid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      if (currentPassword === newPassword) {
        return res
          .status(400)
          .json({ error: "New password must be different from current password" });
      }

      const hashed = await hashPassword(newPassword);
      const userid = req.userid;
      // [SCOPE 152 / T005] A password change signs out every K.A.I.N. device (FR-065, SOC 2 CC6.1),
      // in the same transaction: the password never changes with a device still signed in.
      const revoked = await db.transaction(async (tx) => {
        await tx
          .update(userprofiles)
          .set({
            password: hashed,
            requirepasswordchange: false,
            failedlogins: 0,
            lockeduntil: null,
          })
          .where(eq(userprofiles.id, userid));
        return agentDeviceTokenService.revokeAllForUser(userid, userid, "password_changed", tx);
      });
      await agentDeviceTokenService.auditRevokeAll(userid, userid, "password_changed", revoked);

      logger.info({ userid: req.userid }, "Password changed via settings");
      return res.status(200).json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to change password";
      logger.error({ error: message }, "Change-password error");
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /auth/forgot-password
 * Always returns 200 with a generic success message so the endpoint
 * does not leak which emails exist in the system.
 */
router.post(
  "/forgot-password",
  validateBody(z.object({ email: z.string().email() })),
  async (req: AuthRequest, res: Response) => {
    const { email } = req.body as { email: string };
    const genericResponse = {
      success: true,
      message:
        "If an account with that email exists, a password reset link has been sent.",
    };

    try {
      const users = await db
        .select({ id: userprofiles.id, email: userprofiles.emailaddr })
        .from(userprofiles)
        .where(eq(userprofiles.emailaddr, email))
        .limit(1);

      if (users.length === 0) {
        logger.info({ email }, "Forgot-password for unknown email");
        return res.json(genericResponse);
      }

      const user = users[0];
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error("JWT_SECRET environment variable is not set");

      const token = jwt.sign(
        { userid: user.id, purpose: "password-reset" },
        jwtSecret,
        { expiresIn: "1h" },
      );
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordresettokens).values({
        userid: user.id,
        tokenhash: tokenHash,
        expiresat: expiresAt,
        attemptcount: 0,
      });

      const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
      const resetLink = `${clientUrl}/reset-password?token=${token}`;
      await sendEmail(
        user.email,
        "Reset Your Password - wxKanban",
        getPasswordResetEmailHTML(resetLink, user.email),
        getPasswordResetEmailText(resetLink, user.email),
      );

      logger.info({ userid: user.id }, "Password reset email sent");
      return res.json(genericResponse);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to process password reset";
      logger.error({ error: message, email }, "Forgot-password error");
      return res.json(genericResponse);
    }
  },
);

/**
 * POST /auth/reset-password
 * Consumes a password-reset token (one-time use) and updates the password.
 */
router.post(
  "/reset-password",
  validateBody(
    z.object({
      token: z.string().min(1, "Token is required"),
      newPassword: z
        .string()
        .min(8, "Password must be at least 8 characters"),
    }),
  ),
  async (req: AuthRequest, res: Response) => {
    try {
      const { token, newPassword } = req.body as {
        token: string;
        newPassword: string;
      };

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error("JWT_SECRET environment variable is not set");

      let decoded: { userid?: string; purpose?: string };
      try {
        decoded = jwt.verify(token, jwtSecret) as {
          userid?: string;
          purpose?: string;
        };
      } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      if (decoded.purpose !== "password-reset" || !decoded.userid) {
        return res.status(401).json({ error: "Invalid token purpose" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const records = await db
        .select()
        .from(passwordresettokens)
        .where(eq(passwordresettokens.tokenhash, tokenHash))
        .limit(1);

      if (records.length === 0) {
        return res.status(401).json({ error: "Token not found" });
      }

      const record = records[0];
      if (record.usedat) {
        return res.status(401).json({ error: "Token already used" });
      }
      if (new Date() > record.expiresat) {
        return res.status(401).json({ error: "Token expired" });
      }
      if (record.userid !== decoded.userid) {
        return res.status(401).json({ error: "Token mismatch" });
      }

      const hashed = await hashPassword(newPassword);
      // [SCOPE 152 / T005] The new password, the K.A.I.N. device sign-out (FR-065, SOC 2 CC6.1) and
      // the spent reset link commit together, or none of them does.
      const revoked = await db.transaction(async (tx) => {
        // Clear any account lockout (M-12) so a reset is an immediate recovery path.
        await tx
          .update(userprofiles)
          .set({
            password: hashed,
            requirepasswordchange: false,
            failedlogins: 0,
            lockeduntil: null,
          })
          .where(eq(userprofiles.id, record.userid));
        const devices = await agentDeviceTokenService.revokeAllForUser(record.userid, record.userid, "password_changed", tx);
        await tx
          .update(passwordresettokens)
          .set({ usedat: new Date() })
          .where(eq(passwordresettokens.id, record.id));
        return devices;
      });
      await agentDeviceTokenService.auditRevokeAll(record.userid, record.userid, "password_changed", revoked);

      logger.info({ userid: record.userid }, "Password reset succeeded");
      return res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset password";
      logger.error({ error: message }, "Reset-password error");
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /auth/send-verification-email
 */
router.post(
  "/send-verification-email",
  validateBody(z.object({ email: z.string().email("Invalid email address") })),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email } = req.body;

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error("JWT_SECRET environment variable is not set");
      const token = jwt.sign(
        { email, purpose: "email-verification" },
        jwtSecret,
        { expiresIn: "24h" }
      );

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.insert(emailverificationtokens).values({
        tokenhash: tokenHash,
        expiresat: expiresAt,
        userid: "",
        attemptcount: 0,
      });

      const verificationLink = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
      await sendEmail(email, "Verify Your Email - wxKanban", getVerificationEmailHTML(verificationLink, email), getVerificationEmailText(verificationLink, email));

      logger.info({ email }, "Verification email sent");
      return res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send verification email";
      logger.error({ error: message }, "Send verification email error");
      return res.status(500).json({ error: message });
    }
  }
);

/**
 * GET /auth/verify-email?token=X
 */
router.get("/verify-email", async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token required" });
    }

    let decoded: Record<string, unknown>;
    try {
      const verifySecret = process.env.JWT_SECRET;
      if (!verifySecret) throw new Error("JWT_SECRET environment variable is not set");
      decoded = jwt.verify(token, verifySecret) as Record<string, unknown>;
    } catch (error) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (decoded.purpose !== "email-verification") {
      return res.status(401).json({ error: "Invalid token purpose" });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const tokenRecord = await db
      .select()
      .from(emailverificationtokens)
      .where(eq(emailverificationtokens.tokenhash, tokenHash))
      .limit(1);

    if (tokenRecord.length === 0) {
      return res.status(401).json({ error: "Token not found" });
    }

    if (new Date() > tokenRecord[0].expiresat) {
      return res.status(401).json({ error: "Token expired" });
    }

    if ((tokenRecord[0].attemptcount as unknown as number) >= 5) {
      return res.status(401).json({ error: "Too many verification attempts" });
    }

    await db
      .delete(emailverificationtokens)
      .where(eq(emailverificationtokens.id, tokenRecord[0].id));

    logger.info({ email: decoded.email }, "Email verified successfully");
    return res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify email";
    logger.error({ error: message }, "Verify email error");
    return res.status(500).json({ error: message });
  }
});

export default router;