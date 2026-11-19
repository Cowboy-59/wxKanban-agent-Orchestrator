import { db } from '~/db/client.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { companies } from '~/db/schema/company.js';
import { projecttimeentries } from '~/db/schema/projecttimeentry.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { logger } from '~/server/lib/logger.js';

/**
 * Billing Rate Configuration
 */
export interface BillingRateConfig {
  companyDefaultRate: number | null;
  projectRates: Array<{
    projectid: string;
    projectname: string;
    rate: number | null;
  }>;
  userRates: Array<{
    userid: string;
    username: string;
    rate: number | null;
  }>;
}

/**
 * Rate Resolution Result
 */
export interface ResolvedRate {
  rate: number;
  source: 'user' | 'project' | 'company';
  sourceId: string;
}

/**
 * BillingService
 * Handles rate resolution and billing calculations
 */
export class BillingService {
  /**
   * Resolve billing rate using hierarchy: user > project > company
   * Returns the rate effective at the time of entry
   */
  static async resolveRate(
    userid: string,
    projectid: string,
    companyid: string,
    entryDate: Date
  ): Promise<ResolvedRate> {
    logger.debug(
      { userid, projectid, companyid, entryDate },
      'Resolving billing rate'
    );

    try {
      // 1. Check user-specific rate
      const userResult = await db
        .select({ payrate: userprofiles.payrate })
        .from(userprofiles)
        .where(eq(userprofiles.id, userid))
        .limit(1);

      const userRate = userResult[0]?.payrate;
      if (userRate && parseFloat(userRate) > 0) {
        logger.debug(
          { userid, rate: userRate },
          'Using user-specific rate'
        );
        return {
          rate: parseFloat(userRate),
          source: 'user',
          sourceId: userid,
        };
      }

      // 2. Check project-specific rate
      const projectResult = await db
        .select({ hourlyrate: companyprojects.hourlyrate })
        .from(companyprojects)
        .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
        .limit(1);

      const projectRate = projectResult[0]?.hourlyrate;
      if (projectRate && parseFloat(projectRate) > 0) {
        logger.debug(
          { projectid, rate: projectRate },
          'Using project-specific rate'
        );
        return {
          rate: parseFloat(projectRate),
          source: 'project',
          sourceId: projectid,
        };
      }

      // 3. Fall back to company default rate
      const companyResult = await db
        .select({ hourlyrate: companies.hourlyrate })
        .from(companies)
        .where(eq(companies.id, companyid))
        .limit(1);

      const companyRate = companyResult[0]?.hourlyrate;
      if (companyRate && parseFloat(companyRate) > 0) {
        logger.debug(
          { companyid, rate: companyRate },
          'Using company default rate'
        );
        return {
          rate: parseFloat(companyRate),
          source: 'company',
          sourceId: companyid,
        };
      }

      // 4. No rate configured - return 0
      logger.warn(
        { userid, projectid, companyid },
        'No billing rate configured'
      );
      return {
        rate: 0,
        source: 'company',
        sourceId: companyid,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid, projectid },
        'Failed to resolve billing rate'
      );
      throw error;
    }
  }

  /**
   * Get billing rate configuration for a company
   */
  static async getBillingRates(companyid: string): Promise<BillingRateConfig> {
    logger.info({ companyid }, 'Fetching billing rates');

    try {
      // Get company default rate
      const companyResult = await db
        .select({ hourlyrate: companies.hourlyrate })
        .from(companies)
        .where(eq(companies.id, companyid))
        .limit(1);

      // Get project-specific rates
      const projectResults = await db
        .select({
          id: companyprojects.id,
          name: companyprojects.name,
          hourlyrate: companyprojects.hourlyrate,
        })
        .from(companyprojects)
        .where(eq(companyprojects.companyid, companyid));

      // Get user-specific rates
      const userResults = await db
        .select({
          id: userprofiles.id,
          fullname: userprofiles.fullname,
          payrate: userprofiles.payrate,
        })
        .from(userprofiles)
        .where(eq(userprofiles.companyid, companyid));

      return {
        companyDefaultRate: companyResult[0]?.hourlyrate
          ? parseFloat(companyResult[0].hourlyrate)
          : null,
        projectRates: projectResults.map((p) => ({
          projectid: p.id,
          projectname: p.name,
          rate: p.hourlyrate ? parseFloat(p.hourlyrate) : null,
        })),
        userRates: userResults.map((u) => ({
          userid: u.id,
          username: u.fullname || 'Unknown',
          rate: u.payrate ? parseFloat(u.payrate) : null,
        })),
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', companyid },
        'Failed to fetch billing rates'
      );
      throw error;
    }
  }

  /**
   * Update company default billing rate
   */
  static async updateCompanyRate(
    companyid: string,
    rate: number
  ): Promise<void> {
    logger.info({ companyid, rate }, 'Updating company billing rate');

    try {
      await db
        .update(companies)
        .set({
          hourlyrate: rate.toString(),
          updatedat: new Date(),
        })
        .where(eq(companies.id, companyid));

      logger.info({ companyid, rate }, 'Company billing rate updated');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', companyid },
        'Failed to update company billing rate'
      );
      throw error;
    }
  }

  /**
   * Update project-specific billing rate
   */
  static async updateProjectRate(
    projectid: string,
    companyid: string,
    rate: number | null
  ): Promise<void> {
    logger.info({ projectid, companyid, rate }, 'Updating project billing rate');

    try {
      await db
        .update(companyprojects)
        .set({
          hourlyrate: rate ? rate.toString() : null,
          updatedat: new Date(),
        })
        .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)));

      logger.info({ projectid, rate }, 'Project billing rate updated');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', projectid },
        'Failed to update project billing rate'
      );
      throw error;
    }
  }

  /**
   * Update user-specific billing rate
   */
  static async updateUserRate(
    userid: string,
    companyid: string,
    rate: number | null
  ): Promise<void> {
    logger.info({ userid, companyid, rate }, 'Updating user billing rate');

    try {
      await db
        .update(userprofiles)
        .set({
          payrate: rate ? rate.toString() : null,
        })
        .where(and(eq(userprofiles.id, userid), eq(userprofiles.companyid, companyid)));

      logger.info({ userid, rate }, 'User billing rate updated');
      return;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', userid },
        'Failed to update user billing rate'
      );
      throw error;
    }
  }


  /**
   * Calculate billable amount for time entries
   */
  static async calculateBillableAmount(
    entries: Array<{
      id: string;
      userid: string;
      projectid: string;
      duration: number | null; // in minutes
      starttime: Date;
    }>,
    companyid: string
  ): Promise<{
    totalAmount: number;
    totalHours: number;
    entriesWithRates: Array<{
      entryid: string;
      hours: number;
      rate: number;
      amount: number;
      rateSource: string;
    }>;
  }> {
    logger.info(
      { entryCount: entries.length, companyid },
      'Calculating billable amount'
    );

    try {
      let totalAmount = 0;
      let totalHours = 0;
      const entriesWithRates = [];

      for (const entry of entries) {
        const hours = (entry.duration || 0) / 60;
        const resolvedRate = await this.resolveRate(
          entry.userid,
          entry.projectid,
          companyid,
          entry.starttime
        );

        const amount = hours * resolvedRate.rate;
        totalAmount += amount;
        totalHours += hours;

        entriesWithRates.push({
          entryid: entry.id,
          hours,
          rate: resolvedRate.rate,
          amount,
          rateSource: resolvedRate.source,
        });
      }

      return {
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalHours: Math.round(totalHours * 100) / 100,
        entriesWithRates,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', companyid },
        'Failed to calculate billable amount'
      );
      throw error;
    }
  }

  /**
   * Get unbilled time entries for a company
   */
  static async getUnbilledEntries(
    companyid: string,
    options?: {
      projectid?: string;
      startDate?: Date;
      endDate?: Date;
      userid?: string;
    }
  ): Promise<Array<{
    id: string;
    userid: string;
    projectid: string;
    taskid: string | null; // [SCOPE 005 / T002] nullable since 0072 (scope/project-line entries)
    starttime: Date;
    duration: number | null;
    billable: boolean;
    notes: string | null;
    entryrate: string | null;
  }>> {
    logger.info(
      { companyid, options },
      'Fetching unbilled time entries'
    );

    try {
      const results = await db
        .select({
          id: projecttimeentries.id,
          userid: projecttimeentries.userid,
          projectid: projecttimeentries.projectid,
          taskid: projecttimeentries.taskid,
          starttime: projecttimeentries.starttime,
          duration: projecttimeentries.duration,
          billable: projecttimeentries.billable,
          notes: projecttimeentries.notes,
          entryrate: projecttimeentries.entryrate,
        })
        .from(projecttimeentries)
        .where(
          and(
            eq(projecttimeentries.companyid, companyid),
            eq(projecttimeentries.billable, true),
            eq(projecttimeentries.invoiced, false),
            options?.projectid ? eq(projecttimeentries.projectid, options.projectid) : undefined,
            options?.userid ? eq(projecttimeentries.userid, options.userid) : undefined,
            options?.startDate ? gte(projecttimeentries.starttime, options.startDate) : undefined,
            options?.endDate ? lte(projecttimeentries.starttime, options.endDate) : undefined
          )
        )
        .orderBy(projecttimeentries.starttime);

      return results;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', companyid },
        'Failed to fetch unbilled time entries'
      );
      throw error;
    }
  }

  /**
   * Preview invoice before generation
   */
  static async previewInvoice(
    companyid: string,
    options: {
      projectid?: string;
      startDate: Date;
      endDate: Date;
    }
  ): Promise<{
    totalHours: number;
    totalAmount: number;
    entryCount: number;
    breakdownByUser: Array<{
      userid: string;
      username: string;
      hours: number;
      amount: number;
    }>;
    breakdownByProject: Array<{
      projectid: string;
      projectname: string;
      hours: number;
      amount: number;
    }>;
  }> {
    logger.info(
      { companyid, options },
      'Generating invoice preview'
    );

    try {
      const entries = await this.getUnbilledEntries(companyid, {
        projectid: options.projectid,
        startDate: options.startDate,
        endDate: options.endDate,
      });

      if (entries.length === 0) {
        return {
          totalHours: 0,
          totalAmount: 0,
          entryCount: 0,
          breakdownByUser: [],
          breakdownByProject: [],
        };
      }

      const calculation = await this.calculateBillableAmount(entries, companyid);

      // Get user names for breakdown
      const userIds = [...new Set(entries.map((e) => e.userid))];
      const userNames = await db
        .select({
          id: userprofiles.id,
          fullname: userprofiles.fullname,
        })
        .from(userprofiles)
        .where(and(eq(userprofiles.companyid, companyid), sql`${userprofiles.id} IN (${userIds.join(',')})`));

      const userNameMap = new Map(userNames.map((u) => [u.id, u.fullname || 'Unknown']));

      // Get project names for breakdown
      const projectIds = [...new Set(entries.map((e) => e.projectid))];
      const projectNames = await db
        .select({
          id: companyprojects.id,
          name: companyprojects.name,
        })
        .from(companyprojects)
        .where(and(eq(companyprojects.companyid, companyid), sql`${companyprojects.id} IN (${projectIds.join(',')})`));

      const projectNameMap = new Map(projectNames.map((p) => [p.id, p.name]));

      // Calculate breakdowns
      const userBreakdown = new Map<string, { hours: number; amount: number }>();
      const projectBreakdown = new Map<string, { hours: number; amount: number }>();

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const calc = calculation.entriesWithRates[i];

        // User breakdown
        const userStats = userBreakdown.get(entry.userid) || { hours: 0, amount: 0 };
        userStats.hours += calc.hours;
        userStats.amount += calc.amount;
        userBreakdown.set(entry.userid, userStats);

        // Project breakdown
        const projectStats = projectBreakdown.get(entry.projectid) || { hours: 0, amount: 0 };
        projectStats.hours += calc.hours;
        projectStats.amount += calc.amount;
        projectBreakdown.set(entry.projectid, projectStats);
      }

      return {
        totalHours: calculation.totalHours,
        totalAmount: calculation.totalAmount,
        entryCount: entries.length,
        breakdownByUser: Array.from(userBreakdown.entries()).map(([userid, stats]) => ({
          userid,
          username: userNameMap.get(userid) || 'Unknown',
          hours: Math.round(stats.hours * 100) / 100,
          amount: Math.round(stats.amount * 100) / 100,
        })),
        breakdownByProject: Array.from(projectBreakdown.entries()).map(([projectid, stats]) => ({
          projectid,
          projectname: projectNameMap.get(projectid) || 'Unknown',
          hours: Math.round(stats.hours * 100) / 100,
          amount: Math.round(stats.amount * 100) / 100,
        })),
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', companyid },
        'Failed to generate invoice preview'
      );
      throw error;
    }
  }
}
