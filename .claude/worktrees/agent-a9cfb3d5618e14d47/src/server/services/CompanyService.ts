import { db } from "../db/client.js";
import {
  companies,
  companyprojects as projects,
  userinvitations,
  userprofiles as users,
} from "../../db/schema/index.js";

import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("company-service");

export interface CompanyWithStats {
  id: string;
  name: string;
  maxUsers: number;
  projectCount: number;
  contactEmail: string;
  createdAt: Date;
}

export interface CompanyStats {
  activeProjects: number;
  pendingInvitations: number;
}

/**
 * Get company by ID with stats
 */
export async function getCompanyById(
  companyId: string
): Promise<CompanyWithStats | null> {
  try {
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company.length === 0) {
      return null;
    }

    // Count projects for this company
    const projectsResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(projects)
      .where(eq(projects.companyid, companyId));

    const projectCount = projectsResult[0]?.count || 0;

    return {
      id: company[0].id,
      name: company[0].name,
      maxUsers: 5,
      projectCount,
      contactEmail: company[0].contactemail,
      createdAt: company[0].createdat,
    };
  } catch (error) {
    logger.error({ error, companyId }, "Failed to get company");
    throw error;
  }
}

/**
 * Get company statistics
 */
export async function getCompanyStats(
  companyId: string
): Promise<CompanyStats> {
  try {
    // Active projects
    const projectsResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(projects)
      .where(eq(projects.companyid, companyId));
    const activeProjects = projectsResult[0]?.count || 0;

    // Pending invitations
    const invitationsResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(userinvitations)
      .where(
        and(
          eq(userinvitations.companyid, companyId),
          eq(userinvitations.status, "pending")
        )
      );
    const pendingInvitations = invitationsResult[0]?.count || 0;

    return {
      activeProjects,
      pendingInvitations,
    };
  } catch (error) {
    logger.error({ error, companyId }, "Failed to get company stats");
    throw error;
  }
}

/**
 * Update company information
 */
export async function updateCompanyInfo(
  companyId: string,
  data: {
    name?: string;
    contactEmail?: string;
    address?: string;
  }
) {
  try {
    const updated = await db
      .update(companies)
      .set({
        name: data.name,
        contactemail: data.contactEmail,
        address: data.address,
      })
      .where(eq(companies.id, companyId))
      .returning();

    logger.info({ companyId }, "Company information updated");

    return updated[0] || null;
  } catch (error) {
    logger.error({ error, companyId }, "Failed to update company");
    throw error;
  }
}

/**
 * Get company team members
 */
export async function getCompanyTeamMembers(companyId: string) {
  try {
    // Get all team members for this company, excluding SYSADMIN users
    const members = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.companyid, companyId),
          sql`${users.usertype} != 'SYSADMIN'`
        )
      );

    return members.map((m) => ({
      userid: m.id,
      email: m.emailaddr,
      fullname: m.fullname,
      active: m.active,
      usertype: m.usertype,
      joinedat: m.joinedat,
      language: m.language ?? "en-US", // [SCOPE 051]
    }));
  } catch (error) {
    logger.error({ error, companyId }, "Failed to get team members");
    throw error;
  }
}
