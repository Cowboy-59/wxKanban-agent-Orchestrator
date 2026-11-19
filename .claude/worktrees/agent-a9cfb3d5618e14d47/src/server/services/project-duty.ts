/**
 * Project Duty Setup Service
 *
 * Handles initial duty population on project creation and per-project customization.
 * When a project is created, it gets standard duties + any subscription custom duties
 * that match its security standard.
 *
 * Implements: T046-T047
 * - T046: Hook to populate duties on project creation
 * - T047: Custom duty type override per project
 */

import { logger } from '~/lib/logger';

/**
 * Project duty configuration
 */
export interface ProjectDutyConfig {
  projectId: string;
  dutyName: string;
  sequence: number; // 0-5 for standard, 7+ for custom
  isAvailable: boolean;
  standard?: 'SOC2' | 'HITRUST'; // Which standards this duty is for
  isCustom: boolean; // true if custom duty, false if standard
  addedAt: Date;
}

/**
 * ProjectDutyService
 *
 * Manages duty setup for projects, including initial population
 * and per-project customization.
 */
export class ProjectDutyService {
  /**
   * Initialize duties for a new project
   *
   * Called automatically when project is created (T046).
   * Populates standard duties + subscription custom duties.
   *
   * @param projectId - The new project ID
   * @param subscriptionId - The subscription context
   * @param securityStandard - Security classification (SOC2 or HITRUST)
   * @returns Array of duties added to project
   */
  async initializeProjectDuties(
    projectId: string,
    subscriptionId: string,
    securityStandard: 'SOC2' | 'HITRUST'
  ): Promise<ProjectDutyConfig[]> {
    logger.info(
      { projectId, subscriptionId, securityStandard },
      'Initializing project duties'
    );

    const addedDuties: ProjectDutyConfig[] = [];

    // 1. Add standard duties in sequence
    const standardDuties = [
      { name: 'Developer', sequence: 0 },
      { name: 'Design Coordinator', sequence: 1 },
      { name: 'System Review', sequence: 2 },
      { name: 'QA', sequence: 3 },
      { name: 'Final Acceptance Reviewer', sequence: 4 },
      { name: 'Publisher', sequence: 5 },
    ];

    for (const duty of standardDuties) {
      const config: ProjectDutyConfig = {
        projectId,
        dutyName: duty.name,
        sequence: duty.sequence,
        isAvailable: true,
        standard: securityStandard,
        isCustom: false,
        addedAt: new Date(),
      };

      // Store in database (implementation would use ORM)
      await this.storeDutyConfig(config);
      addedDuties.push(config);
    }

    logger.info(
      { projectId, addedCount: standardDuties.length },
      'Standard duties added to project'
    );

    // 2. Add subscription custom duties that match this security standard
    const customDuties = await this.getSubscriptionCustomDuties(
      subscriptionId,
      securityStandard
    );

    let customDutySequence = 7; // Custom duties start at position 7

    for (const customDuty of customDuties) {
      const config: ProjectDutyConfig = {
        projectId,
        dutyName: customDuty.dutyName,
        sequence: customDutySequence++,
        isAvailable: true,
        standard: securityStandard,
        isCustom: true,
        addedAt: new Date(),
      };

      await this.storeDutyConfig(config);
      addedDuties.push(config);
    }

    if (customDuties.length > 0) {
      logger.info(
        { projectId, customDutiesAdded: customDuties.length },
        'Custom duties added to new project'
      );
    }

    return addedDuties;
  }

  /**
   * Add custom duty to a specific project
   *
   * Allows projects to override which custom duties they use.
   * A project can exclude subscription-wide custom duties if not needed.
   *
   * @param projectId - The project
   * @param dutyName - Custom duty to add
   * @param subscriptionId - The subscription context
   * @returns The added duty configuration
   */
  async addCustomDutyToProject(
    projectId: string,
    dutyName: string,
    subscriptionId: string
  ): Promise<ProjectDutyConfig> {
    logger.info({ projectId, dutyName }, 'Adding custom duty to project');

    // Validate custom duty exists in subscription
    const customDuty = await this.getSubscriptionCustomDutyByName(subscriptionId, dutyName);
    if (!customDuty) {
      throw new Error(`Custom duty "${dutyName}" not found in subscription`);
    }

    // Check if project already has this duty
    const alreadyHas = await this.projectHasDuty(projectId, dutyName);
    if (alreadyHas) {
      throw new Error(`Project already has "${dutyName}" duty assigned`);
    }

    // Get next available sequence number for custom duties
    const nextSequence = await this.getNextCustomDutySequence(projectId);

    const config: ProjectDutyConfig = {
      projectId,
      dutyName,
      sequence: nextSequence,
      isAvailable: true,
      standard: customDuty.standard,
      isCustom: true,
      addedAt: new Date(),
    };

    await this.storeDutyConfig(config);

    logger.info(
      { projectId, dutyName, sequence: nextSequence },
      'Custom duty added to project'
    );

    return config;
  }

  /**
   * Remove custom duty from a specific project
   *
   * Allows projects to opt-out of custom duties they don't need.
   * Cannot remove standard duties or duty if it has active assignments.
   *
   * @param projectId - The project
   * @param dutyName - Custom duty to remove
   * @returns Confirmation of removal
   * @throws Error if duty is standard, has assignments, or is last duty
   */
  async removeCustomDutyFromProject(
    projectId: string,
    dutyName: string
  ): Promise<{
    projectId: string;
    dutyName: string;
    removed: boolean;
    removedAt: Date;
  }> {
    logger.info({ projectId, dutyName }, 'Removing custom duty from project');

    // Check if it's a standard duty (cannot remove)
    const isStandard = await this.isStandardDuty(dutyName);
    if (isStandard) {
      throw new Error(`Cannot remove standard duty "${dutyName}" from project`);
    }

    // Check if duty has active assignments
    const assignmentCount = await this.countDutyAssignments(projectId, dutyName);
    if (assignmentCount > 0) {
      throw new Error(
        `Cannot remove duty "${dutyName}" - has ${assignmentCount} active assignments`
      );
    }

    // Check if it's the last duty in project
    const dutyCount = await this.getProjectDutyCount(projectId);
    if (dutyCount === 1) {
      throw new Error(`Cannot remove "${dutyName}" - project must have at least one duty`);
    }

    // Remove the duty
    await this.removeDutyConfig(projectId, dutyName);

    logger.info({ projectId, dutyName }, 'Custom duty removed from project');

    return {
      projectId,
      dutyName,
      removed: true,
      removedAt: new Date(),
    };
  }

  /**
   * Get all duties configured for a project
   *
   * @param projectId - The project
   * @returns Array of duty configurations in sequence order
   */
  async getProjectDuties(projectId: string): Promise<ProjectDutyConfig[]> {
    logger.debug({ projectId }, 'Fetching project duties');

    // Query implementation would fetch from database ordered by sequence
    // Placeholder: return empty array
    return [];
  }

  /**
   * Enable or disable a duty for a project
   *
   * Projects can temporarily disable duties without removing them.
   * Useful for pausing certain workflow stages.
   *
   * @param projectId - The project
   * @param dutyName - The duty
   * @param isAvailable - true to enable, false to disable
   * @returns Updated configuration
   */
  async setDutyAvailability(
    projectId: string,
    dutyName: string,
    isAvailable: boolean
  ): Promise<ProjectDutyConfig> {
    logger.info(
      { projectId, dutyName, isAvailable },
      'Updating duty availability'
    );

    // Fetch current config
    const config = await this.getDutyConfig(projectId, dutyName);
    if (!config) {
      throw new Error(`Duty "${dutyName}" not found in project`);
    }

    // Update availability
    const updated = { ...config, isAvailable };
    await this.updateDutyConfig(updated);

    logger.info(
      { projectId, dutyName, isAvailable },
      'Duty availability updated'
    );

    return updated;
  }

  /**
   * Get subscription custom duties that should be added to this project
   *
   * Filters custom duties by security standard to only include
   * duties applicable to the project's standard.
   *
   * @param subscriptionId - The subscription
   * @param securityStandard - The project's security standard
   * @returns Array of custom duties
   */
  private async getSubscriptionCustomDuties(
    subscriptionId: string,
    securityStandard: 'SOC2' | 'HITRUST'
  ): Promise<Array<{
    dutyName: string;
    standard: 'SOC2' | 'HITRUST';
  }>> {
    logger.debug({ subscriptionId, securityStandard }, 'Fetching subscription custom duties');

    // Query implementation would fetch custom duties from subscription
    // Filter by standards matching the project's standard
    // Placeholder: return empty array
    return [];
  }

  /**
   * Get a specific custom duty from subscription
   *
   * @param subscriptionId - The subscription
   * @param dutyName - The duty name
   * @returns The custom duty or null
   */
  private async getSubscriptionCustomDutyByName(
    subscriptionId: string,
    dutyName: string
  ): Promise<any> {
    logger.debug({ subscriptionId, dutyName }, 'Fetching custom duty from subscription');

    // Query implementation would fetch specific custom duty
    // Placeholder: return null
    return null;
  }

  /**
   * Check if a project already has a duty
   *
   * @param projectId - The project
   * @param dutyName - The duty name
   * @returns true if project has this duty
   */
  private async projectHasDuty(projectId: string, dutyName: string): Promise<boolean> {
    // Query implementation would check database
    logger.debug({ projectId, dutyName }, 'Checking if project has duty');

    // Placeholder: return false
    return false;
  }

  /**
   * Get next available sequence number for custom duties in project
   *
   * Custom duties start at sequence 7.
   * This returns the next available number after existing custom duties.
   *
   * @param projectId - The project
   * @returns Next sequence number
   */
  private async getNextCustomDutySequence(_projectId: string): Promise<number> {
    // Query implementation would find max sequence for custom duties (7+)
    // Placeholder: return 7 (first custom duty position)
    return 7;
  }

  /**
   * Check if a duty is a standard duty (cannot be removed)
   *
   * @param dutyName - The duty name
   * @returns true if duty is standard
   */
  private async isStandardDuty(dutyName: string): Promise<boolean> {
    const standardDuties = [
      'Developer',
      'Design Coordinator',
      'System Review',
      'QA',
      'Final Acceptance Reviewer',
      'Publisher',
    ];

    return standardDuties.includes(dutyName);
  }

  /**
   * Count active assignments for a duty in a project
   *
   * @param projectId - The project
   * @param dutyName - The duty
   * @returns Count of assignments
   */
  private async countDutyAssignments(projectId: string, dutyName: string): Promise<number> {
    logger.debug({ projectId, dutyName }, 'Counting duty assignments');

    // Query implementation would count DutyAssignment records
    // Placeholder: return 0
    return 0;
  }

  /**
   * Get total count of duties in a project
   *
   * @param projectId - The project
   * @returns Count of duties
   */
  private async getProjectDutyCount(_projectId: string): Promise<number> {
    // Query implementation would count available duties
    // Standard minimum is 6, plus any custom duties
    // Placeholder: return 6
    return 6;
  }

  /**
   * Get a duty configuration for a project
   *
   * @param projectId - The project
   * @param dutyName - The duty
   * @returns The configuration or null
   */
  private async getDutyConfig(
    _projectId: string,
    _dutyName: string
  ): Promise<ProjectDutyConfig | null> {
    // Query implementation would fetch from database
    // Placeholder: return null
    return null;
  }

  /**
   * Store a duty configuration in database
   *
   * @param config - The configuration to store
   */
  private async storeDutyConfig(config: ProjectDutyConfig): Promise<void> {
    logger.debug(
      { projectId: config.projectId, dutyName: config.dutyName, sequence: config.sequence },
      'Storing duty configuration'
    );

    // Implementation would insert/update in database
  }

  /**
   * Update a duty configuration
   *
   * @param config - The updated configuration
   */
  private async updateDutyConfig(config: ProjectDutyConfig): Promise<void> {
    logger.debug(
      { projectId: config.projectId, dutyName: config.dutyName },
      'Updating duty configuration'
    );

    // Implementation would update in database
  }

  /**
   * Remove a duty configuration from database
   *
   * @param projectId - The project
   * @param dutyName - The duty to remove
   */
  private async removeDutyConfig(projectId: string, dutyName: string): Promise<void> {
    logger.debug({ projectId, dutyName }, 'Removing duty configuration');

    // Implementation would delete from database
  }
}

// Export singleton instance
export const projectDutyService = new ProjectDutyService();
