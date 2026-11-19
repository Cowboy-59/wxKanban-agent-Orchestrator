/**
 * User Service
 * Feature 002: User invitation, role assignment, and team management
 *
 * Handles user lifecycle: invitation, account creation, role management, deactivation
 */

import { db } from '../db/client.js';
import { userprofiles, userinvitations } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../server/lib/logger.js';
import { randomBytes } from 'crypto';
import { sendInvitationEmail } from './email-service.js';
import { getCompanyUsers, countCompanyUsers } from '../db/queries.js';

type ServiceUser = Record<string, unknown>;

function mapRoleToUserType(role: 'Admin' | 'TeamManager' | 'Developer'): 'ADMIN' | 'TEAM_MANAGER' | 'TEAM_MEMBER' {
  if (role === 'Admin') return 'ADMIN';
  if (role === 'TeamManager') return 'TEAM_MANAGER';
  return 'TEAM_MEMBER';
}

const logger = createLogger('user-service');

/**
 * Generate a secure invitation token
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Invite a user to the company
 */
export async function inviteUser(data: {
  companyid: string;
  email: string;
  role: 'Admin' | 'TeamManager' | 'Developer';
  payrate?: number;
}): Promise<{
  invitationid: string;
  invitationToken: string;
  email: string;
  role: string;
}> {
  try {
    // Check if user already exists in this company
    const existing = await db
      .select()
      .from(userprofiles)
      .where(
        and(
          eq(userprofiles.companyid, data.companyid),
          eq(userprofiles.emailaddr, data.email.toLowerCase())
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const error = new Error('User already exists in this company');
      logger.warn({ companyid: data.companyid, email: data.email }, error.message);
      throw error;
    }

    // Check if invitation already exists
    const existingInvitation = await db
      .select()
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.companyid, data.companyid),
          eq(userinvitations.email, data.email.toLowerCase())
        )
      )
      .limit(1);

    if (existingInvitation.length > 0 && existingInvitation[0].status === 'pending') {
      const error = new Error('Invitation already pending for this email');
      logger.warn({ companyid: data.companyid, email: data.email }, error.message);
      throw error;
    }

    // Generate invitation token
    const invitationToken = generateInvitationToken();

    // Create invitation record
    const newInvitation = await db
      .insert(userinvitations)
      .values({
        companyid: data.companyid,
        email: data.email.toLowerCase(),
        token: invitationToken,
        status: 'pending',
        expiresat: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        invitedat: new Date(),
        usertype: mapRoleToUserType(data.role),
      })
      .returning();

    if (!newInvitation.length) {
      throw new Error('Failed to create invitation');
    }

    logger.info(
      { companyid: data.companyid, email: data.email, invitationid: newInvitation[0].id },
      'User invitation created'
    );

    return {
      invitationid: newInvitation[0].id,
      invitationToken,
      email: data.email,
      role: data.role,
    };
  } catch (error) {
    logger.error({ error, companyid: data.companyid, email: data.email }, 'Failed to invite user');
    throw error;
  }
}

/**
 * Send invitation email
 */
export async function sendUserInvitationEmail(
  email: string,
  companyName: string,
  invitationToken: string,
  companyid: string
): Promise<boolean> {
  const invitationLink = `${process.env.APP_URL || 'http://localhost:3000'}/accept-invitation?token=${invitationToken}&companyid=${companyid}`;
  const expiresIn = '7 days';

  return await sendInvitationEmail({
    recipientEmail: email,
    companyName,
    invitationLink,
    expiresIn,
  });
}

/**
 * Accept invitation and create user account
 */
export async function acceptInvitation(
  token: string,
  companyid: string,
  userid: string,
  email: string
): Promise<{
  userid: string;
  email: string;
  companyid: string;
  activeflag: boolean;
}> {
  try {
    // Validate invitation exists and is not expired
    const invitation = await db
      .select()
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.token, token),
          eq(userinvitations.companyid, companyid),
          eq(userinvitations.email, email.toLowerCase())
        )
      )
      .limit(1);

    if (!invitation.length) {
      throw new Error('Invalid or expired invitation');
    }

    const inv = invitation[0];

    // Check expiration
    if (inv.expiresat && inv.expiresat < new Date()) {
      throw new Error('Invitation has expired');
    }

    if (inv.status !== 'pending') {
      throw new Error('Invitation has already been used');
    }

    // Mark invitation as accepted
    await db
      .update(userinvitations)
      .set({
        status: 'accepted',
        acceptedat: new Date(),
      })
      .where(eq(userinvitations.id, inv.id));

    logger.info({ companyid, userid, email }, 'Invitation accepted');

    return {
      userid,
      email,
      companyid,
      activeflag: true,
    };
  } catch (error) {
    logger.error({ error, companyid, token }, 'Failed to accept invitation');
    throw error;
  }
}

/**
 * Get company users with pagination
 */
export async function listCompanyUsers(
  companyid: string,
  options?: {
    role?: 'Admin' | 'TeamManager' | 'Developer';
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{
  users: ServiceUser[];
  total: number;
  limit: number;
  offset: number;
}> {
  try {
    // Get users (stub - will be enhanced with filtering)
    const users = await getCompanyUsers(companyid, {
      limit: options?.limit,
      offset: options?.offset,
      activeOnly: options?.activeOnly,
    });

    const total = await countCompanyUsers(companyid, options?.activeOnly ?? false);

    // Transform database results to User type
    const transformedUsers: ServiceUser[] = users.map(u => ({
      ...u,
      companyid: u.companyid || '',
      payrate: u.payrate ? parseInt(u.payrate, 10) : undefined,
    }));

    return {
      users: transformedUsers,
      total,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to list company users');
    throw error;
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  companyid: string,
  userid: string,
  updates: {
    role?: 'Admin' | 'TeamManager' | 'Developer';
    payrate?: number;
    activeflag?: boolean;
    tracktimeflag?: boolean;
    timezone?: string;
  }
): Promise<ServiceUser> {
  try {
    // Verify user exists in this company
    const result = await db
      .select()
      .from(userprofiles)
      .where(and(eq(userprofiles.id, userid), eq(userprofiles.companyid, companyid)))
      .limit(1);

    if (!result.length) {
      throw new Error('User not found in company');
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (updates.role !== undefined) {
      updateData.usertype = mapRoleToUserType(updates.role);
    }
    if (updates.payrate !== undefined) updateData.payrate = updates.payrate?.toString();
    if (updates.activeflag !== undefined) updateData.active = updates.activeflag;
    if (updates.tracktimeflag !== undefined) updateData.tracktime = updates.tracktimeflag;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;

    const updated = await db
      .update(userprofiles)
      .set(updateData)
      .where(and(eq(userprofiles.id, userid), eq(userprofiles.companyid, companyid)))
      .returning();

    if (!updated.length) {
      throw new Error('Failed to update user');
    }

    logger.info({ companyid, userid, fields: Object.keys(updates) }, 'User updated');

    // Transform database result to User type
    const updatedUser = updated[0];
    return {
      ...updatedUser,
      companyid: updatedUser.companyid || '',
      payrate: updatedUser.payrate ? parseInt(updatedUser.payrate, 10) : undefined,
    } as ServiceUser;
  } catch (error) {
    logger.error({ error, companyid, userid }, 'Failed to update user');
    throw error;
  }
}

/**
 * Deactivate user (soft delete)
 */
export async function deactivateUser(
  companyid: string,
  userid: string,
  reason?: string
): Promise<ServiceUser> {
  try {
    // Verify user exists in this company
    const result = await db
      .select()
      .from(userprofiles)
      .where(and(eq(userprofiles.id, userid), eq(userprofiles.companyid, companyid)))
      .limit(1);

    if (!result.length) {
      throw new Error('User not found in company');
    }

    const updated = await db
      .update(userprofiles)
      .set({
        active: false,
      })
      .where(and(eq(userprofiles.id, userid), eq(userprofiles.companyid, companyid)))
      .returning();

    if (!updated.length) {
      throw new Error('Failed to deactivate user');
    }

    logger.info({ companyid, userid, reason }, 'User deactivated');

    // Transform database result to User type
    const deactivatedUser = updated[0];
    return {
      ...deactivatedUser,
      companyid: deactivatedUser.companyid || '',
      payrate: deactivatedUser.payrate ? parseInt(deactivatedUser.payrate, 10) : undefined,
    } as ServiceUser;
  } catch (error) {
    logger.error({ error, companyid, userid }, 'Failed to deactivate user');
    throw error;
  }
}
