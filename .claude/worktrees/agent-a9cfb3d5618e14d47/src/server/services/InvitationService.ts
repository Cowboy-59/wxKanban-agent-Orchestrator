import { db } from '~/db/client.js';
import { userprofiles } from '~/db/schema/userprofiles';
import { userinvitations } from '~/db/schema/userinvitation';
import { eq, and, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger.js';
import { v7 as uuidv7 } from 'uuid';
import { randomBytes } from 'crypto';
import { hashPassword } from '../lib/password.js';


const logger = createLogger('invitation-service');

const INVITATION_EXPIRY_DAYS = 7;

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type UserRole = 'ADMIN' | 'TEAM_MANAGER' | 'TEAM_MEMBER' | 'DEVELOPER';

export interface Invitation {
  id: string;
  email: string;
  usertype: UserRole;
  companyId: string;
  invitedBy: string;
  token: string;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  message?: string;
}

export interface CreateInvitationRequest {
  email: string;
  usertype: UserRole;
  companyId: string;
  invitedBy: string;
  message?: string;
}

export interface AcceptInvitationRequest {
  token: string;
  firstName: string;
  lastName?: string;
  password: string;
}

/**
 * Generate secure invitation token
 */
function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new invitation
 */
export async function createInvitation(
  req: CreateInvitationRequest
): Promise<Invitation> {
  try {
    // Check if user already exists in company
    const existingUser = await db
      .select({ id: userprofiles.id })
      .from(userprofiles)
      .where(
        and(
          eq(userprofiles.emailaddr, req.email),
          eq(userprofiles.companyid, req.companyId)
        )
      )
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists in your company');
    }

    // Check for existing pending invitation
    const existingInvitation = await db
      .select({ id: userinvitations.id })
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.email, req.email),
          eq(userinvitations.companyid, req.companyId),
          eq(userinvitations.status, 'pending')
        )
      )
      .limit(1);

    if (existingInvitation.length > 0) {
      throw new Error('An invitation is already pending for this email');
    }

    const invitationId = uuidv7();
    const token = generateInvitationToken();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    // Insert into database
    await db.insert(userinvitations).values({
      id: invitationId,
      companyid: req.companyId,
      email: req.email,
      token,
      status: 'pending',
      expiresat: expiresAt,
      invitedat: new Date(),
      usertype: req.usertype,
    });

    const invitation: Invitation = {
      id: invitationId,
      email: req.email,
      usertype: req.usertype,
      companyId: req.companyId,
      invitedBy: req.invitedBy,
      token,
      status: 'pending',
      createdAt: new Date(),
      expiresAt,
      message: req.message,
    };

    logger.info(
      {
        invitationId,
        email: req.email,
        companyId: req.companyId,
        usertype: req.usertype,
      },
      'Invitation created'
    );

    return invitation;
  } catch (error) {
    logger.error({ error, email: req.email }, 'Failed to create invitation');
    throw error;
  }
}


/**
 * Get invitation by token
 */
export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  try {
    const result = await db
      .select()
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.token, token),
          eq(userinvitations.status, 'pending')
        )
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const inv = result[0];
    
    // Check if expired
    if (inv.expiresat && new Date(inv.expiresat) < new Date()) {
      // Update status to expired
      await db
        .update(userinvitations)
        .set({ status: 'expired' })
        .where(eq(userinvitations.id, inv.id));
      return null;
    }

    return {
      id: inv.id,
      email: inv.email,
      usertype: inv.usertype as UserRole,
      companyId: inv.companyid,
      invitedBy: '', // Not stored in schema, would need to add invitedBy field
      token: inv.token,
      status: inv.status as InvitationStatus,
      createdAt: inv.invitedat || new Date(),
      expiresAt: inv.expiresat,
      acceptedAt: inv.acceptedat || undefined,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get invitation by token');
    throw error;
  }
}


/**
 * Accept invitation
 */
export async function acceptInvitation(
  req: AcceptInvitationRequest
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const invitation = await getInvitationByToken(req.token);

    if (!invitation) {
      return { success: false, error: 'Invalid or expired invitation' };
    }

    if (invitation.status !== 'pending') {
      return { success: false, error: 'Invitation has already been used or expired' };
    }

    if (new Date() > invitation.expiresAt) {
      return { success: false, error: 'Invitation has expired' };
    }

    // Check if user already exists
    const existingUser = await db
      .select({ id: userprofiles.id })
      .from(userprofiles)
      .where(eq(userprofiles.emailaddr, invitation.email))
      .limit(1);

    let userId: string;

    if (existingUser.length > 0) {
      // User exists, just add them to the company if not already
      const user = existingUser[0];
      // TODO: Handle existing user joining new company (multi-tenant scenario)
      userId = user.id;
    } else {
      // Create new user account
      const passwordHash = await hashPassword(req.password);
      const newUserId = uuidv7();

      await db.insert(userprofiles).values({
        id: newUserId,
        emailaddr: invitation.email,
        password: passwordHash,
        fullname: `${req.firstName} ${req.lastName || ''}`.trim(),
        companyid: invitation.companyId,
        usertype: invitation.usertype,
        active: true,
        securitylevel: invitation.usertype === 'ADMIN' ? 7 : invitation.usertype === 'TEAM_MANAGER' ? 5 : 1,
        joinedat: new Date(),
        timezone: 'UTC',
        tracktime: true,
      });

      userId = newUserId;
    }

    // Update invitation status
    await db
      .update(userinvitations)
      .set({ status: 'accepted', acceptedat: new Date() })
      .where(eq(userinvitations.id, invitation.id));

    logger.info(
      { invitationId: invitation.id, userId },
      'Invitation accepted - user created'
    );

    // [SCOPE 109 / T008] SPEC-109 FR-006 — welcome the person who just joined.
    // Fire-and-forget inside a catch that can only log: a welcome must never
    // block someone from joining a company. Someone already welcomed (an
    // existing customer joining a second company) is skipped by the
    // once-per-person constraint inside sendWelcomeTo, not by logic here.
    void import('./WelcomeMessageService.js')
      .then((m) =>
        m.sendWelcomeTo(
          { userid: userId, email: invitation.email, name: null },
          'invitation',
        ),
      )
      .catch((err) =>
        logger.error({ err, userId }, 'Welcome-on-invitation-accept failed (non-fatal)'),
      );

    return { success: true, userId };
  } catch (error) {
    logger.error({ error, token: req.token }, 'Failed to accept invitation');
    return { success: false, error: 'Failed to accept invitation' };
  }
}


/**
 * Revoke invitation
 */
export async function revokeInvitation(
  invitationId: string,
  revokedBy: string
): Promise<boolean> {
  try {
    // Check if invitation exists and is pending
    const invitation = await db
      .select()
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.id, invitationId),
          eq(userinvitations.status, 'pending')
        )
      )
      .limit(1);

    if (invitation.length === 0) {
      return false;
    }

    // Update invitation status to revoked (using 'expired' as status since schema doesn't have 'revoked')
    await db
      .update(userinvitations)
      .set({ status: 'expired' })
      .where(eq(userinvitations.id, invitationId));

    logger.info({ invitationId, revokedBy }, 'Invitation revoked');
    return true;
  } catch (error) {
    logger.error({ error, invitationId }, 'Failed to revoke invitation');
    return false;
  }
}


/**
 * Resend invitation (creates new token)
 */
export async function resendInvitation(
  invitationId: string
): Promise<Invitation | null> {
  try {
    // Get existing invitation
    const result = await db
      .select()
      .from(userinvitations)
      .where(eq(userinvitations.id, invitationId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const invitation = result[0];

    // Can only resend pending invitations
    if (invitation.status !== 'pending') {
      return null;
    }

    const newToken = generateInvitationToken();
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    // Update with new token and expiration
    await db
      .update(userinvitations)
      .set({ 
        token: newToken, 
        expiresat: newExpiresAt,
        invitedat: new Date() // Reset invited date
      })
      .where(eq(userinvitations.id, invitationId));

    logger.info({ invitationId, email: invitation.email }, 'Invitation resent with new token');

    return {
      id: invitation.id,
      email: invitation.email,
      usertype: invitation.usertype as UserRole,
      companyId: invitation.companyid,
      invitedBy: '',
      token: newToken,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: newExpiresAt,
    };
  } catch (error) {
    logger.error({ error, invitationId }, 'Failed to resend invitation');
    return null;
  }
}


/**
 * List invitations by company
 */
export async function listInvitationsByCompany(
  companyId: string,
  options: {
    status?: InvitationStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ invitations: Invitation[]; total: number }> {
  try {
    const invitationWhere = options.status
      ? and(eq(userinvitations.companyid, companyId), eq(userinvitations.status, options.status))
      : eq(userinvitations.companyid, companyId);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userinvitations)
      .where(eq(userinvitations.companyid, companyId));

    const invitations = await db
      .select()
      .from(userinvitations)
      .where(invitationWhere)
      .limit(options.limit || 50)
      .offset(options.offset || 0);

    const total = countResult[0]?.count || 0;

    logger.info({ companyId, total }, 'Invitations listed');

    return {
      invitations: invitations.map((inv: typeof userinvitations.$inferSelect) => ({
        id: inv.id,
        email: inv.email,
        usertype: inv.usertype as UserRole,
        companyId: inv.companyid,
        invitedBy: '',
        token: inv.token,
        status: inv.status as InvitationStatus,
        createdAt: inv.invitedat || new Date(),
        expiresAt: inv.expiresat,
        acceptedAt: inv.acceptedat || undefined,
      })),
      total,
    };
  } catch (error) {
    logger.error({ error, companyId }, 'Failed to list invitations');
    throw error;
  }
}


/**
 * Check if invitation is valid
 */
export async function validateInvitation(token: string): Promise<{
  valid: boolean;
  invitation?: Invitation;
  error?: string;
}> {
  try {
    const invitation = await getInvitationByToken(token);

    if (!invitation) {
      return { valid: false, error: 'Invalid invitation token' };
    }

    if (invitation.status !== 'pending') {
      return { valid: false, error: 'Invitation is no longer valid' };
    }

    if (new Date() > invitation.expiresAt) {
      return { valid: false, error: 'Invitation has expired' };
    }

    return { valid: true, invitation };
  } catch (error) {
    logger.error({ error, token }, 'Failed to validate invitation');
    return { valid: false, error: 'Failed to validate invitation' };
  }
}

/**
 * Clean up expired invitations
 */
export async function cleanupExpiredInvitations(): Promise<number> {
  try {
    const result = await db
      .update(userinvitations)
      .set({ status: 'expired' })
      .where(
        and(
          eq(userinvitations.status, 'pending'),
          sql`${userinvitations.expiresat} < NOW()`
        )
      );

    const count = result.rowCount || 0;
    logger.info({ count }, 'Expired invitations cleanup completed');
    return count;
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup expired invitations');
    return 0;
  }
}
