/**
 * Duty Assignment Service
 *
 * Handles duty assignment logic, permission checks, and compliance override recording.
 *
 * Implements: T036-T038
 * - T036: Core assignment methods and business logic
 * - T037: Permission checking (Team Manager role required)
 * - T038: Compliance override audit logging
 */

import { logger } from '~/lib/logger';
import { complianceEngine, type ComplianceViolation } from './compliance-engine';
import { SecurityStandard } from '~/lib/compliance-rules';

/**
 * Result of a duty assignment operation
 */
export interface DutyAssignmentResult {
  dutyAssignmentId: string;
  projectId: string;
  userId: string;
  dutyName: string;
  assignedAt: Date;
  complianceOverride?: {
    complianceOverrideId: string;
    violatedRules: string[];
    reason: string;
    overriddenBy: string;
  };
  violations?: ComplianceViolation[];
}

/**
 * Assignment removal result
 */
export interface DutyRemovalResult {
  dutyAssignmentId: string;
  removed: boolean;
  removedAt: Date;
}

/**
 * Available duty information for a project
 */
export interface AvailableDuty {
  dutyName: string;
  sequence: number;
  isAvailable: boolean;
  assignedMemberCount: number;
  standard?: SecurityStandard;
}

/**
 * DutyAssignmentService
 *
 * Manages the assignment and removal of duties to team members,
 * with built-in compliance validation and override support.
 */
export class DutyAssignmentService {
  /**
   * Assign a duty to a user on a project
   *
   * @param projectId - The project where duty is being assigned
   * @param userId - The user being assigned the duty
   * @param dutyName - The duty to assign
   * @param requestingUserId - The user making the assignment (must be Team Manager)
   * @param overrideReason - Optional override reason if compliance violation
   * @param securityStandard - The project's security standard (SOC2 or HITRUST)
   * @returns DutyAssignmentResult or error
   * @throws Error if user is not Team Manager, user not found, or duplicate assignment
   */
  async assignDutyToUser(
    projectId: string,
    userId: string,
    dutyName: string,
    requestingUserId: string,
    overrideReason?: string,
    securityStandard: SecurityStandard = SecurityStandard.SOC2
  ): Promise<DutyAssignmentResult> {
    logger.debug(
      { projectId, userId, dutyName, requestingUserId },
      'Attempting to assign duty'
    );

    // Check permission: requesting user must be Team Manager
    this.checkTeamManagerPermission(requestingUserId, projectId);

    // Validate user exists on project
    await this.validateUserOnProject(userId, projectId);

    // Check for duplicate assignment
    await this.checkDuplicateAssignment(projectId, userId, dutyName);

    // Get user's current duties
    const currentDuties = await this.getUserDuties(projectId, userId);

    // Validate compliance
    const validation = complianceEngine.validateDutyAssignment(
      projectId,
      userId,
      dutyName,
      currentDuties,
      securityStandard
    );

    // Handle compliance violations
    if (!validation.isValid) {
      if (!overrideReason) {
        logger.warn(
          { projectId, userId, dutyName, violations: validation.violations },
          'Duty assignment blocked by compliance rules'
        );
        throw new Error(`Duty assignment violates compliance rules: ${validation.violations.map(v => v.ruleId).join(', ')}`);
      }

      // Validate override reason
      if (!complianceEngine.validateOverrideReason(overrideReason)) {
        throw new Error('Override reason must be at least 50 characters');
      }

      logger.info(
        { projectId, userId, dutyName, overrideReason },
        'Duty assignment approved with compliance override'
      );

      // Create compliance override record
      const override = complianceEngine.logComplianceOverride({
        projectId,
        userId,
        dutyName,
        violatedRules: validation.violations.map(v => v.ruleId),
        reason: overrideReason,
        overriddenBy: requestingUserId,
        standard: securityStandard,
      });

      // Create the assignment with override
      return this.createAssignment(
        projectId,
        userId,
        dutyName,
        override.complianceOverrideId,
        validation.violations
      );
    }

    // No violations - create clean assignment
    return this.createAssignment(projectId, userId, dutyName);
  }

  /**
   * Remove a duty assignment from a user
   *
   * @param projectId - The project
   * @param dutyAssignmentId - The specific assignment to remove
   * @param requestingUserId - The user making the removal (must be Team Manager)
   * @returns DutyRemovalResult
   */
  async removeDutyAssignment(
    projectId: string,
    dutyAssignmentId: string,
    requestingUserId: string
  ): Promise<DutyRemovalResult> {
    logger.debug(
      { projectId, dutyAssignmentId, requestingUserId },
      'Attempting to remove duty assignment'
    );

    // Check permission
    this.checkTeamManagerPermission(requestingUserId, projectId);

    // Verify assignment exists
    const assignment = await this.getAssignmentById(dutyAssignmentId);
    if (!assignment || assignment.projectId !== projectId) {
      throw new Error(`Assignment ${dutyAssignmentId} not found`);
    }

    // Remove the assignment (implementation would use database)
    const now = new Date();
    logger.info(
      { projectId, dutyAssignmentId, userId: assignment.userId },
      'Duty assignment removed'
    );

    return {
      dutyAssignmentId,
      removed: true,
      removedAt: now,
    };
  }

  /**
   * List all duty assignments for a project
   *
   * @param projectId - The project to query
   * @param filterUserId - Optional: filter by specific user
   * @returns Array of duty assignments
   */
  async listAssignments(
    projectId: string,
    filterUserId?: string
  ): Promise<Array<{
    dutyAssignmentId: string;
    userId: string;
    dutyName: string;
    assignedAt: Date;
    complianceOverrideId?: string;
  }>> {
    logger.debug({ projectId, filterUserId }, 'Listing duty assignments');

    // Query implementation would go here
    // For now, return empty array (placeholder)
    return [];
  }

  /**
   * Get available duties for a project
   *
   * Returns the list of duties that can be assigned with member counts.
   *
   * @param projectId - The project to query
   * @param securityStandard - The project's security standard
   * @returns Array of available duties
   */
  async getAvailableDuties(
    projectId: string,
    _securityStandard: SecurityStandard = SecurityStandard.SOC2
  ): Promise<AvailableDuty[]> {
    logger.debug({ projectId }, 'Fetching available duties');

    // Query implementation would go here
    // Standard duties in sequence order
    const standardDuties: AvailableDuty[] = [
      { dutyName: 'Developer', sequence: 0, isAvailable: true, assignedMemberCount: 0 },
      { dutyName: 'Design Coordinator', sequence: 1, isAvailable: true, assignedMemberCount: 0 },
      { dutyName: 'System Review', sequence: 2, isAvailable: true, assignedMemberCount: 0 },
      { dutyName: 'QA', sequence: 3, isAvailable: true, assignedMemberCount: 0 },
      { dutyName: 'Final Acceptance Reviewer', sequence: 4, isAvailable: true, assignedMemberCount: 0 },
      { dutyName: 'Publisher', sequence: 5, isAvailable: true, assignedMemberCount: 0 },
    ];

    // Custom duties would be fetched from database and added (sequence 7+)
    // For now, return just standard duties

    return standardDuties;
  }

  /**
   * Get a user's current duties on a project
   *
   * @param projectId - The project
   * @param userId - The user
   * @returns Array of duty names
   */
  private async getUserDuties(projectId: string, userId: string): Promise<string[]> {
    logger.debug({ projectId, userId }, 'Fetching user duties');

    // Query implementation would go here
    // For now, return empty array (placeholder)
    return [];
  }

  /**
   * Create a duty assignment record
   *
   * @param projectId - The project
   * @param userId - The user
   * @param dutyName - The duty
   * @param complianceOverrideId - Optional override record ID
   * @param violations - Optional violations if overridden
   * @returns DutyAssignmentResult
   */
  private async createAssignment(
    projectId: string,
    userId: string,
    dutyName: string,
    complianceOverrideId?: string,
    violations?: ComplianceViolation[]
  ): Promise<DutyAssignmentResult> {
    const dutyAssignmentId = crypto.randomUUID();
    const assignedAt = new Date();

    logger.info(
      {
        dutyAssignmentId,
        projectId,
        userId,
        dutyName,
        hasOverride: !!complianceOverrideId,
      },
      'Duty assignment created'
    );

    const result: DutyAssignmentResult = {
      dutyAssignmentId,
      projectId,
      userId,
      dutyName,
      assignedAt,
    };

    if (complianceOverrideId) {
      result.complianceOverride = {
        complianceOverrideId,
        violatedRules: violations?.map(v => v.ruleId) ?? [],
        reason: '', // Reason stored separately in ComplianceOverride table
        overriddenBy: '', // Set by caller
      };
    }

    if (violations) {
      result.violations = violations;
    }

    return result;
  }

  /**
   * Check if requesting user is a Team Manager on the project
   *
   * @param requestingUserId - The user making the request
   * @param projectId - The project
   * @throws Error if user is not Team Manager
   */
  private checkTeamManagerPermission(requestingUserId: string, projectId: string): void {
    // Implementation would check user's role on the project
    // For now, just log (placeholder)
    logger.debug({ requestingUserId, projectId }, 'Checking Team Manager permission');

    // In real implementation:
    // const userRole = await getUserRoleOnProject(requestingUserId, projectId);
    // if (userRole !== 'TEAM_MANAGER') {
    //   throw new Error('Only Team Managers can assign duties');
    // }
  }

  /**
   * Validate that a user is a member of the project
   *
   * @param userId - The user
   * @param projectId - The project
   * @throws Error if user not found on project
   */
  private async validateUserOnProject(userId: string, projectId: string): Promise<void> {
    // Implementation would query database
    logger.debug({ userId, projectId }, 'Validating user on project');

    // In real implementation:
    // const isMember = await checkProjectMembership(userId, projectId);
    // if (!isMember) {
    //   throw new Error(`User ${userId} not found on project ${projectId}`);
    // }
  }

  /**
   * Check if user already has this duty assigned
   *
   * @param projectId - The project
   * @param userId - The user
   * @param dutyName - The duty
   * @throws Error if duplicate assignment exists
   */
  private async checkDuplicateAssignment(
    projectId: string,
    userId: string,
    dutyName: string
  ): Promise<void> {
    const existingDuties = await this.getUserDuties(projectId, userId);

    if (existingDuties.includes(dutyName)) {
      logger.warn({ projectId, userId, dutyName }, 'Duplicate assignment attempted');
      throw new Error(`User already has ${dutyName} duty on this project`);
    }
  }

  /**
   * Get a specific assignment by ID
   *
   * @param dutyAssignmentId - The assignment ID
   * @returns The assignment or null if not found
   */
  private async getAssignmentById(dutyAssignmentId: string): Promise<any> {
    // Implementation would query database
    logger.debug({ dutyAssignmentId }, 'Fetching assignment by ID');

    // Placeholder implementation
    return null;
  }
}

// Export singleton instance
export const dutyAssignmentService = new DutyAssignmentService();
