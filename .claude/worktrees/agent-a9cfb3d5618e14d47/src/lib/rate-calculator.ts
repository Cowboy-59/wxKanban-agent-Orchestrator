/**
 * Rate Calculator Utility
 * Implements the three-tier billing rate hierarchy:
 * user rate > project rate > company rate
 *
 * Feature 002: Billing Configuration and Rate Management
 */

import { db } from '../db/client.js';
import { userprofiles } from '../db/schema/userprofiles.js';
import { companyprojects } from '../db/schema/companyproject.js';
import { companies } from '../db/schema/company.js';
import { eq } from 'drizzle-orm';
import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('rate-calculator');

export interface RateHierarchy {
  userRate?: number;
  projectRate?: number;
  companyRate?: number;
  effectiveRate: number;
  source: 'user' | 'project' | 'company';
}

/**
 * Calculate effective hourly rate for a user on a project
 * Hierarchy: user rate > project rate > company rate
 */
export async function calculateEffectiveRate(
  userid: string,
  projectid: string,
  companyid: string
): Promise<RateHierarchy> {
  try {
    // Fetch all rate candidates
    const [userRecord, projectRecord, companyRecord] = await Promise.all([
      db.select().from(userprofiles).where(eq(userprofiles.id, userid)).limit(1),
      db.select().from(companyprojects).where(eq(companyprojects.id, projectid)).limit(1),
      db.select().from(companies).where(eq(companies.id, companyid)).limit(1),
    ]);

    const userData = userRecord[0];
    const projectData = projectRecord[0];
    const companyData = companyRecord[0];

    // Apply hierarchy: user > project > company
    const userRate = userData?.payrate ? Number(userData.payrate) : 0;
    const projRate = projectData?.hourlyrate ? Number(projectData.hourlyrate) : 0;
    const compRate = companyData?.hourlyrate ? Number(companyData.hourlyrate) : 0;

    if (userRate > 0) {
      return {
        userRate,
        projectRate: projRate > 0 ? projRate : undefined,
        companyRate: compRate > 0 ? compRate : undefined,
        effectiveRate: userRate,
        source: 'user',
      };
    }

    if (projRate > 0) {
      return {
        userRate: undefined,
        projectRate: projRate,
        companyRate: compRate > 0 ? compRate : undefined,
        effectiveRate: projRate,
        source: 'project',
      };
    }

    if (compRate > 0) {
      return {
        userRate: undefined,
        projectRate: undefined,
        companyRate: Number(companyData.hourlyrate),
        effectiveRate: Number(companyData.hourlyrate),
        source: 'company',
      };
    }

    // No rate configured - return 0
    logger.warn(
      { userid, projectid, companyid },
      'No billing rate configured in hierarchy'
    );

    return {
      effectiveRate: 0,
      source: 'company',
    };
  } catch (error) {
    logger.error(
      { error, userid, projectid, companyid },
      'Failed to calculate effective rate'
    );
    throw new Error(
      `Failed to calculate rate: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Calculate total billable amount for a time period
 * hours: duration in minutes, convert to hours for billing
 */
export async function calculateBillableAmount(
  userid: string,
  projectid: string,
  companyid: string,
  durationMinutes: number
): Promise<{
  amount: number;
  rate: number;
  hours: number;
  rateSource: string;
}> {
  const hierarchy = await calculateEffectiveRate(userid, projectid, companyid);
  const hours = durationMinutes / 60;
  const amount = hours * hierarchy.effectiveRate;

  return {
    amount,
    rate: hierarchy.effectiveRate,
    hours,
    rateSource: hierarchy.source,
  };
}

/**
 * Validate rate values (must be positive, reasonable limits)
 */
export function validateRate(rate: number | undefined, context: string): boolean {
  if (rate === undefined || rate === null) {
    return true; // Optional rate is valid
  }

  if (typeof rate !== 'number' || rate < 0) {
    logger.warn({ rate, context }, 'Invalid rate value');
    return false;
  }

  // Reasonable maximum: $10,000/hour (adjust as needed)
  if (rate > 10000) {
    logger.warn({ rate, context }, 'Rate exceeds maximum');
    return false;
  }

  return true;
}

/**
 * Get all configured rates for a company
 */
export async function getCompanyRates(companyid: string): Promise<{
  companyRate: number;
  projectRates: Array<{ projectid: string; projectName: string; rate: number }>;
  userRates: Array<{ userid: string; email: string; rate: number }>;
}> {
  try {
    const [companyData, projects, users] = await Promise.all([
      db.select().from(companies).where(eq(companies.id, companyid)).limit(1),
      db
        .select()
        .from(companyprojects)
        .where(eq(companyprojects.companyid, companyid))
        .then((results) =>
          results
            .filter((p) => p.hourlyrate && Number(p.hourlyrate) > 0)
            .map((p) => ({
              projectid: p.id,
              projectName: p.name,
              rate: Number(p.hourlyrate),
            }))
        ),
      db
        .select()
        .from(userprofiles)
        .where(eq(userprofiles.companyid, companyid))
        .then((results) =>
          results
            .filter((u) => u.payrate && Number(u.payrate) > 0)
            .map((u) => ({
              userid: u.id,
              email: u.emailaddr,
              rate: Number(u.payrate),
            }))
        ),
    ]);

    return {
      companyRate: companyData[0]?.hourlyrate ? Number(companyData[0].hourlyrate) : 0,
      projectRates: projects,
      userRates: users,
    };
  } catch (error) {
    logger.error({ error, companyid }, 'Failed to get company rates');
    throw new Error(
      `Failed to get company rates: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
