/**
 * Project-User Service
 * Feature 002: Project team assignment and workload management
 *
 * Handles project user assignments, role management, and team composition
 */

import { db } from '../db/client.js';
import { projectuser, project, user } from '../db/schema/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { createLogger } from '../server/lib/logger.js';

const logger = createLogger('project-user-service');

/**
 * Add user to project with specified role
 */
export async function assignUserToProject(data: {
  projectid: string;
  userid: string;
  role: 'Lead' | 'TeamMember' | 'Observer';
  companyid: string;
}): Promise<{
  projectuserid: string;
  projectid: string;
  userid: string;
  role: string;
}> {
  try {
    // Verify project belongs to company
    const projResult = await db
      .select()
      .from(project)
      .where(and(
        eq(project.projectid, data.projectid),
        eq(project.companyid, data.companyid)
      ))
      .limit(1);

    if (!projResult.length) {
      throw new Error('Project not found in company');
    }

    // Verify user belongs to company
    const userResult = await db
      .select()
      .from(user)
      .where(and(
        eq(user.userid, data.userid),
        eq(user.companyid, data.companyid)
      ))
      .limit(1);

    if (!userResult.length) {
      throw new Error('User not found in company');
    }

    // Check if user already assigned to project
    const existing = await db
      .select()
      .from(projectuser)
      .where(and(
        eq(projectuser.projectid, data.projectid),
        eq(projectuser.userid, data.userid),
        isNull(projectuser.removedat)
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('User already assigned to project');
    }

    // Create assignment
    const newAssignment = await db
      .insert(projectuser)
      .values({
        projectid: data.projectid,
        userid: data.userid,
        role: data.role,
        assignedat: new Date(),
      })
      .returning();

    if (!newAssignment.length) {
      throw new Error('Failed to assign user to project');
    }

    logger.info(
      { projectid: data.projectid, userid: data.userid, role: data.role },
      'User assigned to project'
    );

    return {
      projectuserid: newAssignment[0].projectuserid,
      projectid: newAssignment[0].projectid,
      userid: newAssignment[0].userid,
      role: newAssignment[0].role,
    };
  } catch (error) {
    logger.error({ error, projectid: data.projectid, userid: data.userid }, 'Failed to assign user to project');
    throw error;
  }
}

/**
 * Remove user from project (soft delete with removedat timestamp)
 */
export async function removeUserFromProject(data: {
  projectid: string;
  userid: string;
  companyid: string;
}): Promise<void> {
  try {
    // Verify project belongs to company
    const projResult = await db
      .select()
      .from(project)
      .where(and(
        eq(project.projectid, data.projectid),
        eq(project.companyid, data.companyid)
      ))
      .limit(1);

    if (!projResult.length) {
      throw new Error('Project not found in company');
    }

    // Find active assignment
    const assignment = await db
      .select()
      .from(projectuser)
      .where(and(
        eq(projectuser.projectid, data.projectid),
        eq(projectuser.userid, data.userid),
        isNull(projectuser.removedat)
      ))
      .limit(1);

    if (!assignment.length) {
      throw new Error('User not assigned to project');
    }

    // Mark as removed
    await db
      .update(projectuser)
      .set({ removedat: new Date() })
      .where(eq(projectuser.projectuserid, assignment[0].projectuserid));

    logger.info(
      { projectid: data.projectid, userid: data.userid },
      'User removed from project'
    );
  } catch (error) {
    logger.error({ error, projectid: data.projectid, userid: data.userid }, 'Failed to remove user from project');
    throw error;
  }
}

/**
 * Get all active users on a project
 */
export async function getProjectUsers(projectid: string, companyid: string): Promise<
  Array<{
    projectuserid: string;
    userid: string;
    email: string;
    role: string;
    assignedat: Date;
  }>
> {
  try {
    // Verify project belongs to company
    const projResult = await db
      .select()
      .from(project)
      .where(and(
        eq(project.projectid, projectid),
        eq(project.companyid, companyid)
      ))
      .limit(1);

    if (!projResult.length) {
      throw new Error('Project not found in company');
    }

    // Get active assignments with user details
    const assignments = await db
      .select({
        projectuserid: projectuser.projectuserid,
        userid: projectuser.userid,
        email: user.email,
        role: projectuser.role,
        assignedat: projectuser.assignedat,
      })
      .from(projectuser)
      .innerJoin(user, eq(projectuser.userid, user.userid))
      .where(and(
        eq(projectuser.projectid, projectid),
        isNull(projectuser.removedat)
      ));

    return assignments;
  } catch (error) {
    logger.error({ error, projectid }, 'Failed to get project users');
    throw error;
  }
}

/**
 * Update user role on project
 */
export async function updateProjectUserRole(data: {
  projectid: string;
  userid: string;
  role: 'Lead' | 'TeamMember' | 'Observer';
  companyid: string;
}): Promise<{
  projectuserid: string;
  role: string;
}> {
  try {
    // Verify project belongs to company
    const projResult = await db
      .select()
      .from(project)
      .where(and(
        eq(project.projectid, data.projectid),
        eq(project.companyid, data.companyid)
      ))
      .limit(1);

    if (!projResult.length) {
      throw new Error('Project not found in company');
    }

    // Find active assignment
    const assignment = await db
      .select()
      .from(projectuser)
      .where(and(
        eq(projectuser.projectid, data.projectid),
        eq(projectuser.userid, data.userid),
        isNull(projectuser.removedat)
      ))
      .limit(1);

    if (!assignment.length) {
      throw new Error('User not assigned to project');
    }

    // Update role
    const updated = await db
      .update(projectuser)
      .set({ role: data.role })
      .where(eq(projectuser.projectuserid, assignment[0].projectuserid))
      .returning();

    if (!updated.length) {
      throw new Error('Failed to update user role');
    }

    logger.info(
      { projectid: data.projectid, userid: data.userid, newRole: data.role },
      'User role updated on project'
    );

    return {
      projectuserid: updated[0].projectuserid,
      role: updated[0].role,
    };
  } catch (error) {
    logger.error({ error, projectid: data.projectid, userid: data.userid }, 'Failed to update user role');
    throw error;
  }
}

/**
 * Get count of active team members on project
 */
export async function getProjectTeamMemberCount(projectid: string): Promise<number> {
  try {
    const result = await db
      .select({ count: projectuser.projectuserid })
      .from(projectuser)
      .where(and(
        eq(projectuser.projectid, projectid),
        isNull(projectuser.removedat)
      ));

    return result.length;
  } catch (error) {
    logger.error({ error, projectid }, 'Failed to get team member count');
    throw error;
  }
}

/**
 * Check if user has Lead role on project
 */
export async function isProjectLead(projectid: string, userid: string): Promise<boolean> {
  try {
    const result = await db
      .select()
      .from(projectuser)
      .where(and(
        eq(projectuser.projectid, projectid),
        eq(projectuser.userid, userid),
        eq(projectuser.role, 'Lead'),
        isNull(projectuser.removedat)
      ))
      .limit(1);

    return result.length > 0;
  } catch (error) {
    logger.error({ error, projectid, userid }, 'Failed to check project lead status');
    return false;
  }
}

/**
 * Get all projects for a user in a company
 */
export async function getUserProjects(userid: string, companyid: string): Promise<
  Array<{
    projectid: string;
    projectname: string;
    role: string;
    assignedat: Date;
  }>
> {
  try {
    const projects = await db
      .select({
        projectid: projectuser.projectid,
        projectname: project.name,
        role: projectuser.role,
        assignedat: projectuser.assignedat,
      })
      .from(projectuser)
      .innerJoin(project, eq(projectuser.projectid, project.projectid))
      .where(and(
        eq(projectuser.userid, userid),
        eq(project.companyid, companyid),
        isNull(projectuser.removedat)
      ));

    return projects;
  } catch (error) {
    logger.error({ error, userid, companyid }, 'Failed to get user projects');
    throw error;
  }
}
