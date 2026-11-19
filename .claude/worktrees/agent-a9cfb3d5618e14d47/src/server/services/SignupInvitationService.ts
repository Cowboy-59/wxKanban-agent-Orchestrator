/**
 * Signup Invitation Service
 * Spec 023 — FR-002a (invite-bound signup promotions) + FR-002b.
 *
 * Issues and redeems prospect-facing invitations that grant a promotional free
 * period at registration. The promo duration and the plan live ONLY here,
 * server-side, keyed by a token — never in a client request (FR-002b).
 *
 * Redemption is single-use and enforced by `burnSignupInvitation`, a conditional
 * UPDATE guarded on status='pending'. This is deliberately NOT copied from the
 * existing invite flows: both InvitationService.acceptInvitation and the
 * engagements accept path read the row, do async work, then write status — so two
 * concurrent redemptions can both pass validation. engagementinvitations only
 * survives that because a unique constraint catches the second insert. A signup
 * invite has no such backstop: a double-submit would create two companies and
 * two admin users.
 */

import { randomBytes, createHash } from "crypto";
import { and, desc, eq, lt } from "drizzle-orm";
// This repo has TWO db clients with separate pools: `~/db/client.js`
// (node-postgres) and `src/server/db/client.js` (postgres-js). Use the same one
// as RegistrationService — it owns the transaction that `burnSignupInvitation`
// runs inside, and the burn must not straddle two pools.
import { db } from "~/db/client.js";
import {
  signupinvitations,
  type SignupInvitation,
} from "~/db/schema/signupinvitation.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { logger } from "~/server/lib/logger.js";

export const SIGNUP_INVITE_EXPIRY_DAYS = 30;

/**
 * Hard ceiling on a promotional period, in days (2 months at 30 days/month).
 *
 * Product decision (2026-07-15): no promotion will ever exceed 2 months. This is
 * enforced rather than left as a convention because the failure is silent and
 * expensive — a mis-typed "12" hands out a free year, and nobody finds out until
 * the charge that never came.
 */
export const MAX_PROMO_DAYS = 60;

/** Tiers an invitation may pin. FREE is internal-only and never invited. */
export const INVITABLE_TIERS = [
  "SINGLE_USER",
  "SMALL_BUSINESS",
  "CONSULTANT",
  "ENTERPRISE",
] as const;

export type InvitableTier = (typeof INVITABLE_TIERS)[number];

export type SignupInviteRejection =
  | "NOT_FOUND"
  | "ALREADY_REDEEMED"
  | "REVOKED"
  | "EXPIRED";

// [SCOPE 023 / T107] BEGIN — signup-invite token hashing
/**
 * Tokens are stored as sha256, matching emailverificationtokens /
 * passwordresettokens. The raw token exists only in the invite link.
 */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
// [SCOPE 023 / T107] END

// [SCOPE 023 / T107] BEGIN — issue a signup invitation
export interface CreateSignupInvitationRequest {
  email: string;
  billingplan: InvitableTier;
  promodays: number;
  invitedbyid?: string | null;
  expiresInDays?: number;
}

export interface CreatedSignupInvitation {
  invitation: SignupInvitation;
  /** Raw token — returned once, never recoverable. Build the link from this. */
  rawToken: string;
}

export async function createSignupInvitation(
  req: CreateSignupInvitationRequest,
): Promise<CreatedSignupInvitation> {
  const email = req.email.trim().toLowerCase();

  if (
    !Number.isInteger(req.promodays) ||
    req.promodays < 1 ||
    req.promodays > MAX_PROMO_DAYS
  ) {
    throw new Error(
      `promodays must be a whole number between 1 and ${MAX_PROMO_DAYS} (2 months)`,
    );
  }
  if (!INVITABLE_TIERS.includes(req.billingplan)) {
    throw new Error(`billingplan must be one of ${INVITABLE_TIERS.join(", ")}`);
  }

  // An address that already has an account cannot register again, so an invite
  // for it would be burned for nothing at redemption. Fail at mint instead.
  const existingUser = await db
    .select({ id: userprofiles.id })
    .from(userprofiles)
    .where(eq(userprofiles.emailaddr, email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("That email already has a wxKanban account");
  }

  const existingPending = await db
    .select({ id: signupinvitations.id })
    .from(signupinvitations)
    .where(
      and(
        eq(signupinvitations.email, email),
        eq(signupinvitations.status, "pending"),
      ),
    )
    .limit(1);

  if (existingPending.length > 0) {
    throw new Error(
      "An invitation is already pending for that email — revoke it first",
    );
  }

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(
    expiresAt.getDate() + (req.expiresInDays ?? SIGNUP_INVITE_EXPIRY_DAYS),
  );

  const inserted = await db
    .insert(signupinvitations)
    .values({
      email,
      billingplan: req.billingplan,
      promodays: req.promodays,
      tokenhash: hashToken(rawToken),
      status: "pending",
      expiresat: expiresAt,
      invitedbyid: req.invitedbyid ?? null,
    })
    .returning();

  logger.info(
    {
      invitationId: inserted[0].id,
      email,
      billingplan: req.billingplan,
      promodays: req.promodays,
    },
    "Signup invitation issued",
  );

  return { invitation: inserted[0], rawToken };
}
// [SCOPE 023 / T107] END

// [SCOPE 023 / T107] BEGIN — resolve a signup invitation without consuming it
export type ResolveSignupInvitationResult =
  | { ok: true; invitation: SignupInvitation }
  | { ok: false; reason: SignupInviteRejection };

/**
 * Validate a raw token. Does NOT burn — resolution happens on the public
 * registration page and must be repeatable until the registration completes.
 *
 * Callers must not leak `reason` to unauthenticated clients: it distinguishes a
 * real-but-spent token from a token that never existed.
 */
export async function resolveSignupInvitationByToken(
  rawToken: string,
): Promise<ResolveSignupInvitationResult> {
  if (!rawToken || !/^[a-f0-9]{64}$/i.test(rawToken)) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const rows = await db
    .select()
    .from(signupinvitations)
    .where(eq(signupinvitations.tokenhash, hashToken(rawToken)))
    .limit(1);

  if (rows.length === 0) return { ok: false, reason: "NOT_FOUND" };

  const invitation = rows[0];

  if (invitation.status === "redeemed")
    return { ok: false, reason: "ALREADY_REDEEMED" };
  if (invitation.status === "revoked") return { ok: false, reason: "REVOKED" };

  if (invitation.expiresat.getTime() <= Date.now()) {
    // Lazily reflect expiry so the sysadmin list tells the truth. Guarded on
    // 'pending' so it can never overwrite a redeemed/revoked row.
    if (invitation.status === "pending") {
      await db
        .update(signupinvitations)
        .set({ status: "expired", updatedat: new Date() })
        .where(
          and(
            eq(signupinvitations.id, invitation.id),
            eq(signupinvitations.status, "pending"),
          ),
        );
    }
    return { ok: false, reason: "EXPIRED" };
  }

  if (invitation.status !== "pending") return { ok: false, reason: "EXPIRED" };

  return { ok: true, invitation };
}
// [SCOPE 023 / T107] END

// [SCOPE 023 / T107] BEGIN — atomic single-use burn
/**
 * Consume an invitation. Returns true only for the caller that actually won it.
 *
 * The `status='pending'` predicate is what makes this single-use: Postgres
 * serialises the two UPDATEs, so of two concurrent redemptions exactly one sees
 * a row count of 1 and the other sees 0. Do not "optimise" this into a
 * read-then-write — that is precisely the bug in the sibling invite flows.
 *
 * Pass the surrounding transaction as `tx` so that a failed registration rolls
 * the burn back and the prospect keeps their invitation.
 */
export async function burnSignupInvitation(
  tx: Pick<typeof db, "update">,
  invitationId: string,
  redeemedCompanyId: string,
): Promise<boolean> {
  const burned = await tx
    .update(signupinvitations)
    .set({
      status: "redeemed",
      redeemedat: new Date(),
      redeemedcompanyid: redeemedCompanyId,
      updatedat: new Date(),
    })
    .where(
      and(
        eq(signupinvitations.id, invitationId),
        eq(signupinvitations.status, "pending"),
      ),
    )
    .returning({ id: signupinvitations.id });

  if (burned.length === 0) {
    logger.warn(
      { invitationId, redeemedCompanyId },
      "Signup invitation burn lost the race — already redeemed/revoked/expired",
    );
    return false;
  }

  logger.info(
    { invitationId, redeemedCompanyId },
    "Signup invitation redeemed",
  );
  return true;
}
// [SCOPE 023 / T107] END

// [SCOPE 090 / T002] BEGIN — entitled promo for an already-redeemed company
/**
 * Return the promo trial days a company is entitled to from the signup
 * invitation it redeemed at registration, or 0 if it redeemed none.
 *
 * This is the server-authoritative source for the promo when the Stripe
 * subscription is created AFTER the account exists (the reordered
 * Company → Admin → Payment flow, SCOPE-090). The invitation was already
 * resolved, email-bound and burned inside registerCompany's transaction, so its
 * `promodays` cannot be influenced by the client — reading it back here keeps
 * FR-002b intact (the promo never comes from a request body).
 *
 * Matched by `redeemedcompanyid`, independent of status, so a redeemed row still
 * answers. Returns the max across rows defensively, though a company redeems at
 * most one signup invitation.
 */
export async function getRedeemedPromoDaysForCompany(
  companyId: string,
): Promise<number> {
  const rows = await db
    .select({ promodays: signupinvitations.promodays })
    .from(signupinvitations)
    .where(eq(signupinvitations.redeemedcompanyid, companyId));

  const days = rows.reduce((max, r) => Math.max(max, r.promodays ?? 0), 0);
  return Number.isFinite(days) && days > 0 ? Math.min(days, MAX_PROMO_DAYS) : 0;
}
// [SCOPE 090 / T002] END

// [SCOPE 023 / T107] BEGIN — revoke + list
/** Revoke a pending invitation. Writes 'revoked', not 'expired'. */
export async function revokeSignupInvitation(
  invitationId: string,
): Promise<boolean> {
  const revoked = await db
    .update(signupinvitations)
    .set({ status: "revoked", updatedat: new Date() })
    .where(
      and(
        eq(signupinvitations.id, invitationId),
        eq(signupinvitations.status, "pending"),
      ),
    )
    .returning({ id: signupinvitations.id });

  return revoked.length > 0;
}

export async function listSignupInvitations(): Promise<SignupInvitation[]> {
  // Reflect lapsed invitations before listing so the UI never shows a 'pending'
  // row that would actually be rejected on use.
  await db
    .update(signupinvitations)
    .set({ status: "expired", updatedat: new Date() })
    .where(
      and(
        eq(signupinvitations.status, "pending"),
        lt(signupinvitations.expiresat, new Date()),
      ),
    );

  return db
    .select()
    .from(signupinvitations)
    .orderBy(desc(signupinvitations.invitedat));
}
// [SCOPE 023 / T107] END
