/**
 * Subscription Duty Service
 *
 * Handles subscription-level custom duty type management.
 * Admins can add/remove custom duties that propagate across all projects.
 *
 * Implements: T043-T045
 * - T043: Core custom duty type management
 * - T044: Duty type propagation to all projects
 * - T045: Validation for duty type removal
 */

import { logger } from '~/lib/logger';

/**
 * Custom duty type defined at subscription level
 */
export interface SubscriptionDutyType {
  subscriptionDutyTypeId: string;
  subscriptionId: string;
  dutyName: string;
  allowedFor: SecurityStandard | SecurityStandard[]; // Which standards this duty is available for
  createdAt: Date;
  createdBy: string; // Admin who created it
  updatedAt: Date;
}

/**
 * Custom duty with usage information
 */
export interface CustomDutyWithUsage extends SubscriptionDutyType {
  projectsUsingCount: number;
  assignedMembersCount: number;
  isBeingUsed: boolean;
}

/**
 * Security standard type
 */
type SecurityStandard = 'SOC2' | 'HITRUST';

/**
 * SubscriptionDutyService
 *
 * Manages custom duty types at the subscription level.
 * Custom duties appear in all projects within the subscription.
 */
export class SubscriptionDutyService {
  /**
   * Add a new custom duty type to subscription
   *
   * Custom duties are added to the duty sequence after standard duties (position 7+)
   * and are automatically available in all projects.
   *
   * @param subscriptionId - The subscription
   * @param dutyName - Name of the custom duty (e.g., "Code Reviewer", "DevOps Lead")
   * @param allowedFor - Which security standard(s) this duty is for
   * @param adminUserId - The admin user creating this duty
   * @returns The created SubscriptionDutyType
   * @throws Error if duty name conflicts with standard duties or already exists
   */
  async addCustomDutyType(
    subscriptionId: string,
    dutyName: string,
    allowedFor: SecurityStandard | SecurityStandard[],
    adminUserId: string
  ): Promise<SubscriptionDutyType> {
    logger.info(
      { subscriptionId, dutyName, allowedFor, adminUserId },
      'Adding custom duty type to subscription'
    );

    // Validate duty name
    this.validateDutyName(dutyName);

    // Check for conflicts with standard duties
    const standardDuties = [
      'Developer',
      'Design Coordinator',
      'System Review',
      'QA',
      'Final Acceptance Reviewer',
      'Publisher',
    ];

    if (standardDuties.includes(dutyName)) {
      throw new Error(`Cannot create custom duty with standard name: ${dutyName}`);
    }

    // Check if duty already exists in subscription
    await this.checkDuplicateDuty(subscriptionId, dutyName);

    const now = new Date();
    const subscriptionDutyTypeId = crypto.randomUUID();

    const customDuty: SubscriptionDutyType = {
      subscriptionDutyTypeId,
      subscriptionId,
      dutyName,
      allowedFor: Array.isArray(allowedFor) ? allowedFor : [allowedFor],
      createdAt: now,
      createdBy: adminUserId,
      updatedAt: now,
    };

    logger.info(
      { subscriptionDutyTypeId, dutyName, projectCount: 'N/A' },
      'Custom duty type created, will propagate to all projects'
    );

    // Propagate to all projects (implementation would query database)
    await this.propagateDutyToProjects(subscriptionId, dutyName, allowedFor);

    return customDuty;
  }

  /**
   * Remove a custom duty type from subscription
   *
   * Removes the duty from subscription and all projects.
   * Cannot remove if duty has active assignments.
   *
   * @param subscriptionId - The subscription
   * @param dutyTypeId - The custom duty type ID to remove
   * @param adminUserId - The admin user removing this duty
   * @returns Confirmation with affected project count
   * @throws Error if duty has active assignments or is being used
   */
  async removeDutyType(
    subscriptionId: string,
    dutyTypeId: string,
    adminUserId: string
  ): Promise<{
    dutyTypeId: string;
    removed: boolean;
    removedFromProjectsCount: number;
    removedAt: Date;
  }> {
    logger.info(
      { subscriptionId, dutyTypeId, adminUserId },
      'Removing custom duty type from subscription'
    );

    // Get the duty details
    const dutyType = await this.getDutyTypeById(subscriptionId, dutyTypeId);
    if (!dutyType) {
      throw new Error(`Custom duty type ${dutyTypeId} not found`);
    }

    // Check if duty has active assignments
    const assignmentCount = await this.countDutyAssignments(subscriptionId, dutyType.dutyName);
    if (assignmentCount > 0) {
      logger.warn(
        { dutyTypeId, dutyName: dutyType.dutyName, assignmentCount },
        'Cannot remove duty with active assignments'
      );
      throw new Error(
        `Cannot remove duty "${dutyType.dutyName}" - has ${assignmentCount} active assignments`
      );
    }

    // Check if it's the only duty in any project
    await this.checkLastDutyInProject(subscriptionId, dutyType.dutyName);

    // Remove from all projects
    const projectsAffected = await this.removeDutyFromProjects(subscriptionId, dutyType.dutyName);

    logger.info(
      { dutyTypeId, dutyName: dutyType.dutyName, projectsAffected },
      'Custom duty type removed from subscription and all projects'
    );

    return {
      dutyTypeId,
      removed: true,
      removedFromProjectsCount: projectsAffected,
      removedAt: new Date(),
    };
  }

  /**
   * Get all custom duty types for a subscription
   *
   * @param subscriptionId - The subscription
   * @param filterByStandard - Optional: filter by security standard
   * @returns Array of custom duty types
   */
  async getDutyTypes(
    subscriptionId: string,
    filterByStandard?: SecurityStandard
  ): Promise<SubscriptionDutyType[]> {
    logger.debug(
      { subscriptionId, filterByStandard },
      'Fetching custom duty types for subscription'
    );

    // Query implementation would fetch from database
    // Filter by standard if provided
    // Placeholder: return empty array
    return [];
  }

  /**
   * Get custom duty types with usage information
   *
   * @param subscriptionId - The subscription
   * @returns Array of custom duties with usage counts
   */
  async getDutyTypesWithUsage(subscriptionId: string): Promise<CustomDutyWithUsage[]> {
    logger.debug({ subscriptionId }, 'Fetching custom duty types with usage');

    // Placeholder: return empty array
    return [];
  }

  /**
   * Propagate custom duty changes to all projects in subscription
   *
   * When a custom duty is added to subscription, it needs to appear
   * in all existing and future projects.
   *
   * @param subscriptionId - The subscription
   * @returns Count of projects updated
   */
  async propagateDutyChanges(subscriptionId: string): Promise<number> {
    logger.info({ subscriptionId }, 'Propagating duty changes to all projects');

    // Get all projects in subscription
    const projects = await this.getSubscriptionProjects(subscriptionId);

    // Get all custom duties for subscription
    const customDuties = await this.getDutyTypes(subscriptionId);

    let updatedCount = 0;

    // For each project, ensure it has all custom duties
    for (const project of projects) {
      for (const customDuty of customDuties) {
        // Check if project already has this duty
        const hasduty = await this.projectHasDuty(project.projectId, customDuty.dutyName);

        if (!hasduty) {
          // Add duty to project
          await this.addDutyToProject(project.projectId, customDuty);
          updatedCount++;
        }
      }
    }

    logger.info(
      { subscriptionId, projectsUpdated: updatedCount },
      'Duty changes propagated to all projects'
    );

    return updatedCount;
  }

  /**
   * List all subscription custom duties in subscription and show which projects use them
   *
   * @param subscriptionId - The subscription
   * @returns Summary of custom duties and their usage
   */
  async listDutyUsage(subscriptionId: string): Promise<Array<{
    dutyName: string;
    projectsUsingCount: number;
    totalAssignedMembers: number;
    standards: SecurityStandard[];
  }>> {
    logger.debug({ subscriptionId }, 'Listing duty usage across projects');

    // Placeholder: return empty array
    return [];
  }

  /**
   * Check if custom duty with given name already exists
   *
   * @param subscriptionId - The subscription
   * @param dutyName - The duty name
   * @throws Error if duty already exists
   */
  private async checkDuplicateDuty(subscriptionId: string, dutyName: string): Promise<void> {
    // Query implementation would check database
    logger.debug({ subscriptionId, dutyName }, 'Checking for duplicate duty');

    // Placeholder: assume no duplicates
  }

  /**
   * Validate duty name format and content
   *
   * @param dutyName - The duty name to validate
   * @throws Error if invalid
   */
  private validateDutyName(dutyName: string): void {
    if (!dutyName || dutyName.trim().length === 0) {
      throw new Error('Duty name cannot be empty');
    }

    if (dutyName.length > 100) {
      throw new Error('Duty name must be 100 characters or less');
    }

    // Allow alphanumeric, spaces, parentheses, dashes
    const validNameRegex = /^[a-zA-Z0-9\s\-()]+$/;
    if (!validNameRegex.test(dutyName)) {
      throw new Error(
        'Duty name can only contain letters, numbers, spaces, dashes, and parentheses'
      );
    }
  }

  /**
   * Propagate a duty to all projects in subscription
   *
   * @param subscriptionId - The subscription
   * @param dutyName - The duty to add
   * @param allowedFor - Standards this duty is allowed for
   */
  private async propagateDutyToProjects(
    subscriptionId: string,
    dutyName: string,
    allowedFor: SecurityStandard | SecurityStandard[]
  ): Promise<void> {
    logger.debug(
      { subscriptionId, dutyName, allowedFor },
      'Propagating duty to all projects'
    );

    // Get all projects in subscription
    const projects = await this.getSubscriptionProjects(subscriptionId);

    // Add duty to each project that matches the standard requirement
    for (const project of projects) {
      const standards = Array.isArray(allowedFor) ? allowedFor : [allowedFor];

      if (standards.includes(project.securityStandard)) {
        await this.addDutyToProject(project.projectId, {
          subscriptionDutyTypeId: crypto.randomUUID(),
          subscriptionId,
          dutyName,
          allowedFor: standards,
          createdAt: new Date(),
          createdBy: 'system',
          updatedAt: new Date(),
        });
      }
    }
  }

  /**
   * Remove a duty from all projects in subscription
   *
   * @param subscriptionId - The subscription
   * @param dutyName - The duty to remove
   * @returns Count of projects updated
   */
  private async removeDutyFromProjects(
    subscriptionId: string,
    dutyName: string
  ): Promise<number> {
    logger.debug({ subscriptionId, dutyName }, 'Removing duty from all projects');

    // Get all projects in subscription
    const projects = await this.getSubscriptionProjects(subscriptionId);

    let removedCount = 0;

    // Remove duty from each project
    for (const project of projects) {
      const hadDuty = await this.projectHasDuty(project.projectId, dutyName);
      if (hadDuty) {
        await this.removeDutyFromProject(project.projectId, dutyName);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Count active assignments for a duty across subscription
   *
   * @param subscriptionId - The subscription
   * @param dutyName - The duty
   * @returns Count of active assignments
   */
  private async countDutyAssignments(
    subscriptionId: string,
    dutyName: string
  ): Promise<number> {
    logger.debug({ subscriptionId, dutyName }, 'Counting duty assignments');

    // Query implementation would count assignments across all projects
    // Placeholder: return 0
    return 0;
  }

  /**
   * Check if removing duty would leave project with no duties
   *
   * @param subscriptionId - The subscription
   * @param dutyName - The duty to remove
   * @throws Error if it's the last duty in any project
   */
  private async checkLastDutyInProject(
    subscriptionId: string,
    dutyName: string
  ): Promise<void> {
    logger.debug({ subscriptionId, dutyName }, 'Checking if duty is last in any project');

    // Get all projects in subscription
    const projects = await this.getSubscriptionProjects(subscriptionId);

    for (const project of projects) {
      const dutyCount = await this.getProjectDutyCount(project.projectId);

      if (dutyCount === 1) {
        throw new Error(
          `Cannot remove "${dutyName}" - it's the only duty in project ${project.projectId}`
        );
      }
    }
  }

  /**
   * Get all projects in subscription
   *
   * @param subscriptionId - The subscription
   * @returns Array of projects
   */
  private async getSubscriptionProjects(
    subscriptionId: string
  ): Promise<Array<{
    projectId: string;
    projectName: string;
    securityStandard: SecurityStandard;
  }>> {
    logger.debug({ subscriptionId }, 'Fetching subscription projects');

    // Query implementation would fetch from database
    // Placeholder: return empty array
    return [];
  }

  /**
   * Get a custom duty type by ID
   *
   * @param subscriptionId - The subscription
   * @param dutyTypeId - The duty type ID
   * @returns The duty type or null
   */
  private async getDutyTypeById(
    subscriptionId: string,
    dutyTypeId: string
  ): Promise<SubscriptionDutyType | null> {
    logger.debug({ subscriptionId, dutyTypeId }, 'Fetching duty type by ID');

    // Query implementation would fetch from database
    // Placeholder: return null
    return null;
  }

  /**
   * Check if project has a duty
   *
   * @param projectId - The project
   * @param dutyName - The duty name
   * @returns true if project has this duty
   */
  private async projectHasDuty(_projectId: string, _dutyName: string): Promise<boolean> {
    // Query implementation would check database
    // Placeholder: return false
    return false;
  }

  /**
   * Add a duty to a project
   *
   * @param projectId - The project
   * @param dutyType - The duty to add
   */
  private async addDutyToProject(
    projectId: string,
    dutyType: SubscriptionDutyType
  ): Promise<void> {
    logger.debug({ projectId, dutyName: dutyType.dutyName }, 'Adding duty to project');

    // Implementation would insert into database
  }

  /**
   * Remove a duty from a project
   *
   * @param projectId - The project
   * @param dutyName - The duty to remove
   */
  private async removeDutyFromProject(projectId: string, dutyName: string): Promise<void> {
    logger.debug({ projectId, dutyName }, 'Removing duty from project');

    // Implementation would delete from database
  }

  /**
   * Get count of duties in a project
   *
   * @param projectId - The project
   * @returns Count of duties available
   */
  private async getProjectDutyCount(_projectId: string): Promise<number> {
    // Query implementation would count duties in project
    // Standard duties (6) + custom duties count
    // Placeholder: return 6 (standard duties only)
    return 6;
  }
}

// Export singleton instance
export const subscriptionDutyService = new SubscriptionDutyService();
