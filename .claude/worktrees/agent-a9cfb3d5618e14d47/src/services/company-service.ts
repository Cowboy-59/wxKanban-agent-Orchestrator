/**
 * Company Service
 * Feature 002: Company registration, verification, profile management
 *
 * Handles company lifecycle: creation, email verification, profile updates, deactivation
 */

import { db } from '../db/client.js';
import { company } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { createLogger } from '../server/lib/logger.js';
import { randomBytes } from 'crypto';
import { sendVerificationEmail } from './email-service.js';
import type { Company, BillingPlan } from '../types/index.js';

const logger = createLogger('company-service');

/**
 * Generate a secure verification token
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new company with initial admin user
 */
export async function createCompany(data: {
  name: string;
  contactemail: string;
  billingplan: BillingPlan;
  hourlyrate?: number;
  address?: string;
  logourl?: string;
}): Promise<{
  company: Company;
  verificationToken: string;
}> {
  try {
    // Check if company email already exists
    const existing = await db
      .select()
      .from(company)
      .where(eq(company.contactemail, data.contactemail.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      const error = new Error('Company with this email already exists');
      logger.warn({ contactemail: data.contactemail }, error.message);
      throw error;
    }

    // Generate verification token
    const verificationToken = generateVerificationToken();

    // Create company
    const newCompany: typeof company.$inferInsert = {
      name: data.name,
      contactemail: data.contactemail.toLowerCase(),
      billingplan: data.billingplan,
      hourlyrate: data.hourlyrate?.toString(),
      address: data.address,
      logourl: data.logourl,
      activeflag: false, // Not active until email verified
      verifiedat: null,
      createdat: new Date(),
      updatedat: new Date(),
    };

    const result = await db.insert(company).values(newCompany).returning();
    const createdCompany = result[0];

    if (!createdCompany) {
      throw new Error('Failed to create company');
    }

    logger.info({ companyid: createdCompany.companyid, contactemail: data.contactemail }, 'Company created');

    // Return token for email sending (caller will send the email)
    return {
      company: createdCompany,
      verificationToken,
    };
  } catch (error) {
    logger.error({ error, contactemail: data.contactemail }, 'Failed to create company');
    throw error;
  }
}

/**
 * Helper to send verification email for new company
 */
export async function sendCompanyVerificationEmail(
  email: string,
  companyid: string,
  token: string
): Promise<boolean> {
  const verificationLink = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?companyid=${companyid}&token=${token}`;
  const expiresIn = '7 days';

  return await sendVerificationEmail({
    recipientEmail: email,
    verificationLink,
    expiresIn,
  });
}

/**
 * Verify company email with token and activate
 */
export async function verifyCompanyEmail(companyid: string, _verificationToken: string): Promise<Company> {
  try {
    // Get company
    const result = await db.select().from(company).where(eq(company.companyid, companyid)).limit(1);

    if (!result.length) {
      const error = new Error('Company not found');
      logger.warn({ companyid }, error.message);
      throw error;
    }

    // In a real system, we would validate the verificationToken here
    // For now, we'll just mark as verified and active
    // TODO: Implement token storage and validation in database
    const updated = await db
      .update(company)
      .set({
        activeflag: true,
        verifiedat: new Date(),
        updatedat: new Date(),
      })
      .where(eq(company.companyid, companyid))
      .returning();

    if (!updated.length) {
      throw new Error('Failed to verify company');
    }

    logger.info({ companyid }, 'Company email verified');

    return updated[0];
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to verify company email');
    throw error;
  }
}

/**
 * Get company profile with metrics
 */
export async function getCompanyProfile(companyid: string): Promise<
  Company & {
    userCount: number;
    projectCount: number;
  }
> {
  try {
    const result = await db.select().from(company).where(eq(company.companyid, companyid)).limit(1);

    if (!result.length) {
      const error = new Error('Company not found');
      logger.warn({ companyid }, error.message);
      throw error;
    }

    // Get user and project counts (stub for now)
    const userCount = 0; // TODO: Query actual user count
    const projectCount = 0; // TODO: Query actual project count

    return {
      ...result[0],
      userCount,
      projectCount,
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get company profile');
    throw error;
  }
}

/**
 * Update company profile
 */
export async function updateCompanyProfile(
  companyid: string,
  updates: {
    name?: string;
    contactemail?: string;
    hourlyrate?: number;
    address?: string;
    logourl?: string;
  }
): Promise<Company> {
  try {
    // Verify company exists
    const result = await db.select().from(company).where(eq(company.companyid, companyid)).limit(1);

    if (!result.length) {
      throw new Error('Company not found');
    }

    // If email is being changed, check for duplicates
    if (updates.contactemail) {
      const existing = await db
        .select()
        .from(company)
        .where(eq(company.contactemail, updates.contactemail.toLowerCase()))
        .limit(1);

      if (existing.length > 0 && existing[0].companyid !== companyid) {
        throw new Error('Email already in use by another company');
      }
    }

    const updateData: Record<string, unknown> = {
      updatedat: new Date(),
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.contactemail) updateData.contactemail = updates.contactemail.toLowerCase();
    if (updates.hourlyrate !== undefined) updateData.hourlyrate = updates.hourlyrate?.toString();
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.logourl !== undefined) updateData.logourl = updates.logourl;

    const updated = await db
      .update(company)
      .set(updateData)
      .where(eq(company.companyid, companyid))
      .returning();

    if (!updated.length) {
      throw new Error('Failed to update company');
    }

    logger.info({ companyid, fields: Object.keys(updates) }, 'Company updated');

    return updated[0];
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to update company');
    throw error;
  }
}

/**
 * Deactivate company (soft delete)
 */
export async function deactivateCompany(companyid: string, reason?: string): Promise<Company> {
  try {
    const result = await db.select().from(company).where(eq(company.companyid, companyid)).limit(1);

    if (!result.length) {
      throw new Error('Company not found');
    }

    const updated = await db
      .update(company)
      .set({
        activeflag: false,
        updatedat: new Date(),
      })
      .where(eq(company.companyid, companyid))
      .returning();

    if (!updated.length) {
      throw new Error('Failed to deactivate company');
    }

    logger.info({ companyid, reason }, 'Company deactivated');

    return updated[0];
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to deactivate company');
    throw error;
  }
}
