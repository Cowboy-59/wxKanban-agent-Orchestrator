import { db } from "~/db/client.js";
import { companies } from "~/db/schema/company";
import { userprofiles } from "~/db/schema/userprofiles";
import { companysubscriptions } from "~/db/schema/companysubscription";
import { logger } from "~/server/lib/logger";
import { isStripeCcProcessingEnabled } from "~/server/lib/stripe";
import { validateEmail, validatePassword } from "~/server/lib/passwordValidator";
import { hashPassword } from "~/server/lib/password";
import { generateUniqueReferralCode } from "~/server/lib/referralCode";
// [SCOPE 023 / T109] Invite-bound signup promotions (FR-002a).
import {
  resolveSignupInvitationByToken,
  burnSignupInvitation,
} from "~/server/services/SignupInvitationService.js";
import { v7 as uuidv7 } from "uuid";
import { and, eq } from "drizzle-orm";

/**
 * Registration service for company and admin account creation
 * Orchestrates company setup, subscription tier assignment, and initial admin user creation
 *
 * Workflow:
 * 1. Validate input
 * 2. Check for duplicate company name and email
 * 3. Create company record
 * 4. Create admin user account
 * 5. Log audit trail
 * 6. Queue verification email
 */

export type SubscriptionTier = "FREE" | "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

export interface RegistrationRequest {
  companyName: string;
  billingEmail: string;
  billingAddress: string;
  billingCountry: string;
  billingPhone: string;
  subscriptionTier: SubscriptionTier;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName?: string;
  /** Optional Stripe customer id returned from POST /payment/registration/subscribe */
  stripeCustomerId?: string;
  /** Optional Stripe subscription id returned from POST /payment/registration/subscribe */
  stripeSubscriptionId?: string;
  /** Promo days actually applied at subscribe-time (for provenance). */
  appliedPromoDays?: number;
  // [SCOPE 023 / T109] BEGIN — invite-bound signup promotions (FR-002a, FR-002b)
  /**
   * Raw signup-invitation token from the invite link. When present it is the
   * ONLY source of the promo period and the plan: the invited email is enforced
   * against adminEmail and subscriptionTier is overridden from the invitation.
   * Like `distributor`, privilege comes from the server-resolved token — never
   * from what the client claims (FR-002b).
   */
  inviteToken?: string;
  // [SCOPE 023 / T109] END
  // [SCOPE 088 / T002] BEGIN — Distributor onboarding + referral attribution inputs (FR-003, FR-008, FR-009)
  /**
   * When true, this is a distributor self-onboarding through /distributor-signup:
   * the tier is forced to FREE and a unique referralcode is generated. This flag
   * is gated at the route layer — the public wizard cannot set it.
   */
  distributor?: boolean;
  /** Referral code a customer entered at signup. Validated; unknown codes are ignored. */
  referredBy?: string;
  // [SCOPE 088 / T002] END
  // [SCOPE 064 / T010] Amendment A — newsletter opt-in at signup. Defaults to true
  // (opted-in) when omitted; false unsubscribes the new admin from both categories.
  newsletterOptIn?: boolean;
}

export interface RegistrationResponse {
  company: {
    companyId: string;
    companyName: string;
    subscriptionTier: SubscriptionTier;
    subscriptionStatus: "ACTIVE" | "PENDING";
    maxUsers: number;
    createdAt: Date;
    /** [SCOPE 088 / T002] Distributor's own shareable referral code (distributor signups only). */
    referralCode?: string;
    /** [SCOPE 088 / T002] True when this account was provisioned as a distributor. */
    distributor?: boolean;
  };
  admin: {
    userId: string;
    email: string;
    firstName: string;
    usertype: "ADMIN";
    status: "PENDING" | "ACTIVE";
  };
  verificationToken: string;
  nextStep: "verify_email" | "complete_onboarding";
}

/**
 * Get max users for subscription tier
 */
function getMaxUsersForTier(tier: SubscriptionTier): number {
  switch (tier) {
    case "FREE":
      return 1;
    case "SINGLE_USER":
      return 1;
    case "SMALL_BUSINESS":
      return 25;
    case "CONSULTANT":
      return 999;
    case "ENTERPRISE":
      return 25; // +$5/user over 25 via overage (FR-004)
    default:
      return 1;
  }
}

/**
 * Monthly plan price per spec 023 FR-001 (repriced 2026-05-30).
 * Must stay in sync with stripeConfig.pricing in src/server/lib/stripe.ts.
 */
function getMonthlyPriceForTier(tier: SubscriptionTier): number {
  switch (tier) {
    case "FREE":
      return 0;
    case "SINGLE_USER":
      return 19.95;
    case "SMALL_BUSINESS":
      return 29.95;
    case "CONSULTANT":
      return 39.95;
    case "ENTERPRISE":
      return 59.95;
    default:
      return 0;
  }
}

/**
 * Get default subscription status for tier
 */
function getDefaultSubscriptionStatus(
  tier: SubscriptionTier,
  opts?: { hasStripeSubscription?: boolean; billingExempt?: boolean },
): "ACTIVE" | "PENDING" {
  // FREE is a legacy / internal tier — never requires payment.
  if (tier === "FREE") return "ACTIVE";

  // Billing-exempt companies (spec 023 Design Decisions) never hit Stripe.
  if (opts?.billingExempt) return "ACTIVE";

  // Paid tiers (SMALL_BUSINESS / CONSULTANT / ENTERPRISE) gate activation on
  // Stripe payment confirmation (FR-001). If card processing is disabled
  // we leave accounts immediately active so dev/testing isn't blocked.
  if (!isStripeCcProcessingEnabled()) return "ACTIVE";

  // Paid tier + Stripe enabled: wait for webhook to flip ACTIVE.
  return "PENDING";
}

/**
 * Validate registration input
 */
export async function validateRegistrationInput(
  req: RegistrationRequest
): Promise<{
  isValid: boolean;
  errors: Record<string, string[]>;
}> {
  const errors: Record<string, string[]> = {};

  // Validate company name
  if (!req.companyName || req.companyName.length < 2 || req.companyName.length > 255) {
    errors.companyName = ["Must be 2-255 characters"];
  }

  // Validate billing email
  if (!validateEmail(req.billingEmail)) {
    errors.billingEmail = ["Must be a valid email address"];
  }

  // [SCOPE 088 / T002] Distributor (FREE) signups collect no billing address/phone,
  // so the physical-billing checks are skipped for them. Billing email is still validated above.
  if (!req.distributor) {
    // Validate billing address
    if (!req.billingAddress || req.billingAddress.length < 10 || req.billingAddress.length > 500) {
      errors.billingAddress = ["Must be 10-500 characters"];
    }

    // Validate country code
    if (!req.billingCountry || !/^[A-Z]{2}$/.test(req.billingCountry)) {
      errors.billingCountry = ["Must be valid ISO 3166-1 alpha-2 country code"];
    }

    // Validate phone
    if (!req.billingPhone || req.billingPhone.length < 10 || req.billingPhone.length > 20) {
      errors.billingPhone = ["Must be 10-20 characters"];
    }
  }

  // Validate tier. SINGLE_USER is the default public signup tier; FREE remains
  // valid for internal/legacy/billing-exempt accounts but is not offered in the UI.
  if (!["FREE", "SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"].includes(req.subscriptionTier)) {
    errors.subscriptionTier = ["Must be SINGLE_USER, SMALL_BUSINESS, CONSULTANT, or ENTERPRISE"];
  }

  // Validate admin email
  if (!validateEmail(req.adminEmail)) {
    errors.adminEmail = ["Must be a valid email address"];
  }

  // Validate admin password
  const passwordValidation = validatePassword(req.adminPassword);
  if (!passwordValidation.isValid) {
    errors.adminPassword = passwordValidation.errors;
  }

  // Validate admin name
  if (!req.adminFirstName || req.adminFirstName.length < 1 || req.adminFirstName.length > 100) {
    errors.adminFirstName = ["Must be 1-100 characters"];
  }

  if (
    req.adminLastName &&
    (req.adminLastName.length < 1 || req.adminLastName.length > 100)
  ) {
    errors.adminLastName = ["Must be 1-100 characters"];
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Check for duplicate company and email
 */
export async function checkDuplicates(
  companyName: string,
  billingEmail: string,
  adminEmail: string
): Promise<{
  isDuplicate: boolean;
  duplicateFields: string[];
  message?: string;
}> {
  try {
    // Check for duplicate company name
    const existingCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.name, companyName))
      .limit(1);

    if (existingCompany.length > 0) {
      return {
        isDuplicate: true,
        duplicateFields: ["companyName"],
        message: "Company name already registered",
      };
    }

    // Check for duplicate billing email in company table
    const existingBillingEmail = await db
      .select()
      .from(companies)
      .where(eq(companies.contactemail, billingEmail))
      .limit(1);

    if (existingBillingEmail.length > 0) {
      return {
        isDuplicate: true,
        duplicateFields: ["billingEmail"],
        message: "Billing email already registered",
      };
    }

    // Check for duplicate admin email in user table
    const existingAdminEmail = await db
      .select()
      .from(userprofiles)
      .where(eq(userprofiles.emailaddr, adminEmail))
      .limit(1);

    if (existingAdminEmail.length > 0) {
      return {
        isDuplicate: true,
        duplicateFields: ["adminEmail"],
        message: "Admin email already registered",
      };
    }

    return {
      isDuplicate: false,
      duplicateFields: [],
    };
  } catch (error) {
    logger.error({ error }, "Error checking for duplicates");
    throw new Error("Failed to check for duplicate records");
  }
}

// [SCOPE 088 / T002] BEGIN — Referral attribution resolution (FR-008)
/**
 * Resolve a customer-entered referral code to a valid distributor code.
 * Uppercases + trims, then verifies the code belongs to an existing distributor
 * account. Returns the normalized code on match, or null (and logs) otherwise —
 * an unknown code must never block registration.
 */
export async function resolveReferredBy(rawCode: string | undefined): Promise<string | null> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return null;

  const match = await db
    .select({ referralcode: companies.referralcode })
    .from(companies)
    .where(and(eq(companies.referralcode, code), eq(companies.distributor, true)))
    .limit(1);

  if (match.length === 0) {
    logger.warn({ referredBy: code }, "Unrecognized referral code at signup — ignored");
    return null;
  }
  return code;
}
// [SCOPE 088 / T002] END

/**
 * Register new company and create admin account
 */
export async function registerCompany(
  req: RegistrationRequest
): Promise<RegistrationResponse> {
  try {
    req.adminEmail = req.adminEmail.trim().toLowerCase();
    req.billingEmail = req.billingEmail.trim().toLowerCase();

    // 1. Validate input
    const validation = await validateRegistrationInput(req);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${JSON.stringify(validation.errors)}`);
    }

    // 2. Check for duplicates
    const duplicateCheck = await checkDuplicates(
      req.companyName,
      req.billingEmail,
      req.adminEmail
    );
    if (duplicateCheck.isDuplicate) {
      throw new Error(duplicateCheck.message);
    }

    // [SCOPE 023 / T109] BEGIN — resolve + bind the signup invitation (FR-002a)
    // Resolved before anything is written so a bad token costs nothing. Unlike
    // resolveReferredBy (attribution — fail-open by design), an invitation is an
    // entitlement: an unknown, spent, revoked or expired token must hard-fail.
    const invitation = req.inviteToken
      ? await (async () => {
          const resolved = await resolveSignupInvitationByToken(req.inviteToken!);
          if (!resolved.ok) {
            throw new Error(`INVITE_${resolved.reason}`);
          }
          // The link is bound to one address. Possessing the token is not
          // permission to register as somebody else.
          if (resolved.invitation.email !== req.adminEmail) {
            throw new Error("INVITE_EMAIL_MISMATCH");
          }
          return resolved.invitation;
        })()
      : null;
    // [SCOPE 023 / T109] END

    // 3. Create company record
    const companyId = uuidv7();
    // [SCOPE 088 / T002] Distributor signups are always FREE regardless of any tier sent.
    // [SCOPE 023 / T109] An invitation pins the plan, overriding whatever the
    // client sent. Distributor still wins — it is a separate gated route.
    const effectiveTier: SubscriptionTier = req.distributor
      ? "FREE"
      : ((invitation?.billingplan as SubscriptionTier) ?? req.subscriptionTier);
    const hasStripeSubscription = Boolean(
      req.stripeCustomerId && req.stripeSubscriptionId,
    );
    const subscriptionStatus = getDefaultSubscriptionStatus(
      effectiveTier,
      { hasStripeSubscription },
    );
    const maxUsers = getMaxUsersForTier(effectiveTier);

    // [SCOPE 088 / T002] Distributor gets a generated unique referral code;
    // a customer-entered referral code is resolved to a valid distributor code (or null).
    const referralCode = req.distributor ? await generateUniqueReferralCode() : null;
    const referredBy = await resolveReferredBy(req.referredBy);

    // [SCOPE 023 / T109] BEGIN — company insert + invitation burn, atomically.
    // The burn is the single-use gate (FR-002a). It must share a transaction
    // with the company insert, in this order:
    //
    //   - Company first, because signupinvitations.redeemedcompanyid carries an
    //     FK to companies.id — burning first would violate it.
    //   - Burn second, as the gate. Of two concurrent redemptions of one token,
    //     the second UPDATE blocks on the first's row lock, then re-reads and
    //     sees status='redeemed' → 0 rows → throw → its company rolls back.
    //     Exactly one company survives.
    //
    // Rolling back also satisfies FR-002a's "a failed registration does not
    // consume the invitation".
    const [newCompany] = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(companies)
        .values({
          id: companyId,
          name: req.companyName,
          contactemail: req.billingEmail,
          address: req.billingAddress,
          phone: req.billingPhone,
          billingplan: effectiveTier,
          subscriptionstatus: subscriptionStatus,
          maxusers: maxUsers,
          activeflag: true,
          distributor: req.distributor ?? false,
          referralcode: referralCode,
          referredby: referredBy,
          createdat: new Date(),
          updatedat: new Date(),
        })
        .returning();

      if (invitation) {
        const won = await burnSignupInvitation(tx, invitation.id, companyId);
        if (!won) {
          // Someone already redeemed this token. Unwind the company.
          throw new Error("INVITE_ALREADY_REDEEMED");
        }
      }

      return inserted;
    });
    // [SCOPE 023 / T109] END

    logger.info(
      {
        companyId,
        companyName: req.companyName,
        subscriptionTier: req.subscriptionTier,
        subscriptionStatus,
        hasStripeSubscription,
      },
      "Company created"
    );

    // 3b. If caller completed a Stripe checkout for a paid tier, link the
    // subscription so webhook events (spec 023 chunk C) can flip status later.
    if (hasStripeSubscription) {
      await db.insert(companysubscriptions).values({
        companyid: companyId,
        stripecustomerid: req.stripeCustomerId!,
        stripesubscriptionid: req.stripeSubscriptionId!,
        planname: req.subscriptionTier,
        planamount: String(getMonthlyPriceForTier(req.subscriptionTier)),
        activeuserlimit: maxUsers,
        promotrialdays: req.appliedPromoDays ?? null,
        status: "incomplete",
      });
      logger.info(
        {
          companyId,
          stripeSubscriptionId: req.stripeSubscriptionId,
          stripeCustomerId: req.stripeCustomerId,
        },
        "companysubscriptions row inserted",
      );

      // [SCOPE 090 / T001] BEGIN — Inline fail-open activation.
      // The client pays Stripe BEFORE this insert, so by now the invoice is
      // already paid and Stripe reports the subscription active — but the
      // activation webhook (invoice.paid / subscription.updated) very likely
      // fired during the gap before this row existed and was dropped as an
      // "unknown subscription" (see StripeWebhookHandler + FR-005). So first
      // activation must NOT depend on webhook delivery order: reconcile inline
      // from Stripe right now. This reuses the SCOPE-085 machinery (idempotent —
      // a no-op if a webhook already won the race) and is strictly FAIL-OPEN:
      // any Stripe/DB/network error is swallowed so it can never fail
      // registration; the row stays "incomplete"/PENDING and the existing
      // reconcile paths (webhook + sysadmin "Recheck Stripe") remain the
      // fallback. changedBy is omitted (system-initiated → null uuid).
      try {
        // Dynamic import keeps the billing/stripe/email transitive graph out of
        // RegistrationService's static module load (and makes even an import
        // failure part of the fail-open guarantee below).
        const { resyncSubscriptionFromStripe } = await import(
          "~/server/services/SubscriptionRecoveryService.js"
        );
        const r = await resyncSubscriptionFromStripe(companyId, {
          reason: "Auto-activate at registration (inline Stripe reconcile)",
          source: "registration-inline",
        });
        logger.info(
          { companyId, stripeStatus: r.stripeStatus, toCompanyStatus: r.toCompanyStatus, changed: r.changed },
          "Inline registration activation reconcile complete",
        );
      } catch (err) {
        logger.warn(
          { companyId, error: err instanceof Error ? err.message : String(err) },
          "Inline registration activation reconcile failed (fail-open) — company left PENDING for webhook/sysadmin fallback",
        );
      }
      // [SCOPE 090 / T001] END
    }

    // 4. Create admin user account
    const userId = uuidv7();
    const passwordHash = await hashPassword(req.adminPassword);

    // [SCOPE 064 / T010] Amendment A — opted-in by default (NULL = subscribed);
    // an explicit false at signup unsubscribes from both categories.
    const newsletterOptOut = req.newsletterOptIn === false ? new Date() : null;

    const [newUser] = await db
      .insert(userprofiles)
      .values({
        id: userId,
        emailaddr: req.adminEmail,
        password: passwordHash,
        fullname: req.adminFirstName,
        active: true,
        securitylevel: 7,
        usertype: "ADMIN",
        companyid: companyId,
        updatesunsubscribedat: newsletterOptOut,
        promosunsubscribedat: newsletterOptOut,
      })
      .returning();

    logger.info(
      {
        userId,
        companyId,
        email: req.adminEmail,
      },
      "Admin user created"
    );

    // 5. Generate verification token
    const verificationToken = uuidv7();

    // 6. Log audit trail
    logger.info(
      {
        companyId,
        userId,
        companyName: req.companyName,
        subscriptionTier: req.subscriptionTier,
      },
      "Company registration completed"
    );

    return {
      company: {
        companyId,
        companyName: newCompany.name,
        subscriptionTier: effectiveTier,
        subscriptionStatus: subscriptionStatus as "ACTIVE" | "PENDING",
        maxUsers,
        createdAt: newCompany.createdat,
        referralCode: referralCode ?? undefined,
        distributor: newCompany.distributor,
      },
      admin: {
        userId,
        email: newUser.emailaddr,
        firstName: newUser.fullname || "",
        usertype: "ADMIN",
        status: "PENDING",
      },
      verificationToken,
      nextStep: "verify_email",
    };
  } catch (error) {
    logger.error(
      { error, companyName: req.companyName },
      "Failed to register company"
    );
    throw error;
  }
}

/**
 * Get company by ID
 */
export async function getCompanyById(companyId: string) {
  try {
    const result = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    logger.error({ error, companyId }, "Failed to get company");
    throw error;
  }
}

/**
 * Get admin user for company
 */
export async function getCompanyAdmin(companyId: string) {
  try {
    const result = await db
      .select()
      .from(userprofiles)
      .where(eq(userprofiles.companyid, companyId))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    logger.error({ error, companyId }, "Failed to get company admin");
    throw error;
  }
}
