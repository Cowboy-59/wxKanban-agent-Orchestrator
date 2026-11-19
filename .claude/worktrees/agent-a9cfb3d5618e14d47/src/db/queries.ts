/**
 * Database Query Helpers with Company Isolation
 *
 * All queries are scoped by company to avoid cross-tenant access.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "./client.js";
import {
  userprofiles,
  companyprojects,
  companies,
  projectinvoices,
  projectusers,
} from "./schema/index.js";
import { createLogger } from "../server/lib/logger.js";

const logger = createLogger("db-queries");

function withCompanyFilter(companyid: string) {
  return {
    userByCompany: (userid?: string) =>
      userid
        ? and(eq(userprofiles.companyid, companyid), eq(userprofiles.id, userid))
        : eq(userprofiles.companyid, companyid),
    projectByCompany: (projectid?: string) =>
      projectid
        ? and(eq(companyprojects.companyid, companyid), eq(companyprojects.id, projectid))
        : eq(companyprojects.companyid, companyid),
    invoiceByCompany: (invoiceid?: string) =>
      invoiceid
        ? and(eq(projectinvoices.companyid, companyid), eq(projectinvoices.id, invoiceid))
        : eq(projectinvoices.companyid, companyid),
  };
}

export async function getCompanyUsers(
  companyid: string,
  options?: { limit?: number; offset?: number; activeOnly?: boolean },
) {
  try {
    const filter = withCompanyFilter(companyid);
    const whereClause = options?.activeOnly
      ? and(filter.userByCompany(), eq(userprofiles.active, true))
      : filter.userByCompany();

    if (options?.limit !== undefined && options?.offset !== undefined) {
      return await db
        .select()
        .from(userprofiles)
        .where(whereClause)
        .limit(options.limit)
        .offset(options.offset);
    }

    if (options?.limit !== undefined) {
      return await db
        .select()
        .from(userprofiles)
        .where(whereClause)
        .limit(options.limit);
    }

    if (options?.offset !== undefined) {
      return await db
        .select()
        .from(userprofiles)
        .where(whereClause)
        .offset(options.offset);
    }

    return await db.select().from(userprofiles).where(whereClause);
  } catch (error) {
    logger.error({ error, companyid }, "Failed to get company users");
    throw error;
  }
}

export async function getUserById(companyid: string, userid: string) {
  try {
    const filter = withCompanyFilter(companyid);
    const result = await db.select().from(userprofiles).where(filter.userByCompany(userid));
    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, companyid, userid }, "Failed to get user by ID");
    throw error;
  }
}

export async function getCompanyProjects(
  companyid: string,
  options?: { limit?: number; offset?: number },
) {
  try {
    const filter = withCompanyFilter(companyid);

    if (options?.limit !== undefined && options?.offset !== undefined) {
      return await db
        .select()
        .from(companyprojects)
        .where(filter.projectByCompany())
        .limit(options.limit)
        .offset(options.offset);
    }

    if (options?.limit !== undefined) {
      return await db
        .select()
        .from(companyprojects)
        .where(filter.projectByCompany())
        .limit(options.limit);
    }

    if (options?.offset !== undefined) {
      return await db
        .select()
        .from(companyprojects)
        .where(filter.projectByCompany())
        .offset(options.offset);
    }

    return await db.select().from(companyprojects).where(filter.projectByCompany());
  } catch (error) {
    logger.error({ error, companyid }, "Failed to get company projects");
    throw error;
  }
}

export async function getProjectById(companyid: string, projectid: string) {
  try {
    const filter = withCompanyFilter(companyid);
    const result = await db
      .select()
      .from(companyprojects)
      .where(filter.projectByCompany(projectid));
    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, companyid, projectid }, "Failed to get project by ID");
    throw error;
  }
}

export async function getCompanyInvoices(
  companyid: string,
  options?: { limit?: number; offset?: number },
) {
  try {
    const filter = withCompanyFilter(companyid);

    if (options?.limit !== undefined && options?.offset !== undefined) {
      return await db
        .select()
        .from(projectinvoices)
        .where(filter.invoiceByCompany())
        .limit(options.limit)
        .offset(options.offset);
    }

    if (options?.limit !== undefined) {
      return await db
        .select()
        .from(projectinvoices)
        .where(filter.invoiceByCompany())
        .limit(options.limit);
    }

    if (options?.offset !== undefined) {
      return await db
        .select()
        .from(projectinvoices)
        .where(filter.invoiceByCompany())
        .offset(options.offset);
    }

    return await db.select().from(projectinvoices).where(filter.invoiceByCompany());
  } catch (error) {
    logger.error({ error, companyid }, "Failed to get company invoices");
    throw error;
  }
}

export async function getInvoiceById(companyid: string, invoiceid: string) {
  try {
    const filter = withCompanyFilter(companyid);
    const result = await db
      .select()
      .from(projectinvoices)
      .where(filter.invoiceByCompany(invoiceid));
    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, companyid, invoiceid }, "Failed to get invoice by ID");
    throw error;
  }
}

export async function getProjectTeam(companyid: string, projectid: string) {
  try {
    const proj = await getProjectById(companyid, projectid);
    if (!proj) {
      logger.warn({ companyid, projectid }, "Project not found in company");
      return [];
    }

    return await db.select().from(projectusers).where(eq(projectusers.projectid, projectid));
  } catch (error) {
    logger.error({ error, companyid, projectid }, "Failed to get project team");
    throw error;
  }
}

export async function getUserProjects(companyid: string, userid: string) {
  try {
    const usr = await getUserById(companyid, userid);
    if (!usr) {
      logger.warn({ companyid, userid }, "User not found in company");
      return [];
    }

    return await db
      .select({
        projectuser: projectusers,
        project: companyprojects,
      })
      .from(projectusers)
      .innerJoin(companyprojects, eq(projectusers.projectid, companyprojects.id))
      .where(eq(projectusers.userid, userid));
  } catch (error) {
    logger.error({ error, companyid, userid }, "Failed to get user projects");
    throw error;
  }
}

export async function getCompanyInfo(companyid: string) {
  try {
    const result = await db.select().from(companies).where(eq(companies.id, companyid));
    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, companyid }, "Failed to get company info");
    throw error;
  }
}

export async function countCompanyUsers(companyid: string, activeOnly = false) {
  try {
    const whereClause = activeOnly
      ? and(eq(userprofiles.companyid, companyid), eq(userprofiles.active, true))
      : eq(userprofiles.companyid, companyid);

    const result = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(userprofiles)
      .where(whereClause);

    return Number(result[0]?.count) || 0;
  } catch (error) {
    logger.error({ error, companyid }, "Failed to count users");
    throw error;
  }
}

export async function countCompanyProjects(companyid: string) {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(companyprojects)
      .where(eq(companyprojects.companyid, companyid));

    return Number(result[0]?.count) || 0;
  } catch (error) {
    logger.error({ error, companyid }, "Failed to count projects");
    throw error;
  }
}

export async function getProjectWithMetrics(companyid: string, projectid: string) {
  try {
    const proj = await getProjectById(companyid, projectid);
    if (!proj) {
      return null;
    }

    const teamResult = await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(projectusers)
      .where(eq(projectusers.projectid, projectid));

    return {
      ...proj,
      teamMemberCount: Number(teamResult[0]?.count) || 0,
    };
  } catch (error) {
    logger.error({ error, companyid, projectid }, "Failed to get project with metrics");
    throw error;
  }
}

export async function getCompanyProjectsWithMetrics(
  companyid: string,
  options?: { limit?: number; offset?: number },
) {
  try {
    let rows;

    if (options?.limit !== undefined && options?.offset !== undefined) {
      rows = await db
        .select({
          project: companyprojects,
          teamMemberCount: sql<number>`count(distinct ${projectusers.userid})`.as("teamMemberCount"),
        })
        .from(companyprojects)
        .leftJoin(projectusers, eq(companyprojects.id, projectusers.projectid))
        .where(eq(companyprojects.companyid, companyid))
        .groupBy(companyprojects.id)
        .limit(options.limit)
        .offset(options.offset);
    } else if (options?.limit !== undefined) {
      rows = await db
        .select({
          project: companyprojects,
          teamMemberCount: sql<number>`count(distinct ${projectusers.userid})`.as("teamMemberCount"),
        })
        .from(companyprojects)
        .leftJoin(projectusers, eq(companyprojects.id, projectusers.projectid))
        .where(eq(companyprojects.companyid, companyid))
        .groupBy(companyprojects.id)
        .limit(options.limit);
    } else if (options?.offset !== undefined) {
      rows = await db
        .select({
          project: companyprojects,
          teamMemberCount: sql<number>`count(distinct ${projectusers.userid})`.as("teamMemberCount"),
        })
        .from(companyprojects)
        .leftJoin(projectusers, eq(companyprojects.id, projectusers.projectid))
        .where(eq(companyprojects.companyid, companyid))
        .groupBy(companyprojects.id)
        .offset(options.offset);
    } else {
      rows = await db
        .select({
          project: companyprojects,
          teamMemberCount: sql<number>`count(distinct ${projectusers.userid})`.as("teamMemberCount"),
        })
        .from(companyprojects)
        .leftJoin(projectusers, eq(companyprojects.id, projectusers.projectid))
        .where(eq(companyprojects.companyid, companyid))
        .groupBy(companyprojects.id);
    }

    return rows.map((row) => ({
      ...row.project,
      teamMemberCount: Number(row.teamMemberCount) || 0,
    }));
  } catch (error) {
    logger.error({ error, companyid }, "Failed to get company projects with metrics");
    throw error;
  }
}

export async function verifyUserInCompany(companyid: string, userid: string) {
  const usr = await getUserById(companyid, userid);
  if (!usr) {
    const error = new Error(`User ${userid} does not belong to company ${companyid}`);
    logger.warn({ companyid, userid }, "User company mismatch");
    throw error;
  }
  return usr;
}

export async function verifyProjectInCompany(companyid: string, projectid: string) {
  const proj = await getProjectById(companyid, projectid);
  if (!proj) {
    const error = new Error(`Project ${projectid} does not belong to company ${companyid}`);
    logger.warn({ companyid, projectid }, "Project company mismatch");
    throw error;
  }
  return proj;
}

export async function verifyInvoiceInCompany(companyid: string, invoiceid: string) {
  const inv = await getInvoiceById(companyid, invoiceid);
  if (!inv) {
    const error = new Error(`Invoice ${invoiceid} does not belong to company ${companyid}`);
    logger.warn({ companyid, invoiceid }, "Invoice company mismatch");
    throw error;
  }
  return inv;
}
