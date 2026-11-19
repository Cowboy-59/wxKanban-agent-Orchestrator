/**
 * Task Routing Service
 *
 * Handles automatic and manual task routing through the duty workflow sequence.
 * Implements the 6-stage duty sequence: Developer → Design Coordinator → System Review → QA → FAR → Publisher
 *
 * Implements: T039-T042
 * - T039: Core routing methods and workflow progression
 * - T040: Duty sequence logic implementation
 * - T041: Auto-assignment (single member) and manual selection (multiple members)
 * - T042: ALL duty special handling (assign to all team members)
 */

import { logger } from '~/lib/logger';
import { DUTY_SEQUENCE_ORDER } from '~/lib/compliance-rules';

/**
 * Result of task routing operation
 */
export interface TaskRoutingResult {
  taskId: string;
  status: 'autoAssigned' | 'requiresManualSelection' | 'assignAllTeamMembers' | 'complete';
  nextDuty?: string;
  assignedToUserId?: string;
  assignedCount?: number;
  availableTeamMembers?: Array<{
    userId: string;
    userName: string;
    dutyName: string;
  }>;
  message?: string;
  completedAt?: Date;
}

/**
 * Team member with assigned duty
 */
export interface TeamMemberDuty {
  userId: string;
  userName: string;
  email: string;
  dutyName: string;
  isAvailable: boolean;
}

/**
 * Task duty history entry
 */
export interface TaskDutyHistoryEntry {
  taskId: string;
  dutyName: string;
  assignedToUserId: string;
  assignedToUserName: string;
  assignedAt: Date;
  completedAt?: Date;
  reason?: string; // For reassignment reason
}

/**
 * TaskRoutingService
 *
 * Manages task workflow progression through the six-stage duty sequence.
 * The workflow follows this exact order to ensure proper review and approval:
 *
 * DUTY SEQUENCE (in order):
 * 1. Developer       - Implements the required work/changes
 * 2. Design Coord    - Reviews design and architecture decisions
 * 3. System Review   - Performs independent system-level review
 * 4. QA              - Executes testing and quality assurance
 * 5. Final Accept.   - Final acceptance review and approval
 * 6. Publisher       - Releases/publishes to production
 *
 * ROUTING ALGORITHM:
 * When routing from one duty to the next:
 *
 * Step 1: Identify next duty in sequence
 *   - If current duty is Publisher (final), task is COMPLETE
 *   - Otherwise, get the next duty from DUTY_SEQUENCE_ORDER
 *
 * Step 2: Find available team members for next duty
 *   - Query assignments for next duty on this project
 *   - Exclude archived/inactive members
 *
 * Step 3: Route based on availability
 *   - 0 members:      ERROR - cannot progress
 *   - 1 member:       AUTO-ASSIGN (no user choice needed)
 *   - 2+ members:     MANUAL SELECTION (return options, user chooses)
 *
 * Step 4: Handle special cases
 *   - ALL duty:       Assign simultaneously to ALL team members
 *   - Reassignment:   Record reason in audit trail
 *
 * TEAM MANAGER ROLE:
 * Can trigger manual routing even when members are available for auto-assignment.
 * Can reassign tasks to different members at any time.
 *
 * AUDIT TRAIL:
 * Every assignment is logged with: who assigned, when, which duty, and if reassigned, why.
 * This ensures complete traceability of task progression through workflow.
 */
export class TaskRoutingService {
  /**
   * Route task to next duty in sequence
   *
   * Implements the core routing logic:
   * - Single member available → auto-assign
   * - Multiple members available → return options for manual selection
   * - No members available → error
   * - Final duty reached → mark task complete
   * - ALL duty special handling → assign to all members
   *
   * @param taskId - The task to route
   * @param projectId - The project context
   * @param currentDutyName - Current duty name
   * @param manualAssigneeId - Optional: specify assignee if multiple available
   * @returns TaskRoutingResult
   */
  async routeTaskToNextDuty(
    taskId: string,
    projectId: string,
    currentDutyName: string,
    manualAssigneeId?: string
  ): Promise<TaskRoutingResult> {
    logger.debug(
      { taskId, projectId, currentDutyName, manualAssigneeId },
      'Routing task to next duty'
    );

    // Special case: ALL duty (assign to all team members)
    if (this.isAllDuty(currentDutyName)) {
      return this.handleAllDutyRouting(taskId, projectId, currentDutyName);
    }

    // Get next duty in sequence
    const nextDuty = this.getNextDutyInSequence(currentDutyName);

    // Check if at final duty
    if (!nextDuty) {
      logger.info({ taskId }, 'Task completed all duty stages');
      return {
        taskId,
        status: 'complete',
        message: 'Task has completed all duty workflow stages',
        completedAt: new Date(),
      };
    }

    // Find team members available for next duty
    const availableMembers = await this.getTeamMembersForDuty(projectId, nextDuty);

    logger.info(
      { taskId, nextDuty, availableMemberCount: availableMembers.length },
      'Found available team members for next duty'
    );

    // Single member available → auto-assign
    if (availableMembers.length === 1) {
      const assignee = availableMembers[0];
      return this.assignTaskToMember(taskId, projectId, nextDuty, assignee.userId, assignee.userName);
    }

    // Multiple members available → require selection
    if (availableMembers.length > 1) {
      logger.info(
        { taskId, nextDuty, optionCount: availableMembers.length },
        'Multiple team members available, manual selection required'
      );

      // If manual assignee provided, validate and assign
      if (manualAssigneeId) {
        const selectedMember = availableMembers.find(m => m.userId === manualAssigneeId);
        if (!selectedMember) {
          throw new Error(`User ${manualAssigneeId} does not have ${nextDuty} duty on this project`);
        }
        return this.assignTaskToMember(
          taskId,
          projectId,
          nextDuty,
          selectedMember.userId,
          selectedMember.userName
        );
      }

      // No assignee specified, return options
      return {
        taskId,
        status: 'requiresManualSelection',
        nextDuty,
        availableTeamMembers: availableMembers.map(m => ({
          userId: m.userId,
          userName: m.userName,
          dutyName: m.dutyName,
        })),
        message: `Multiple team members available for ${nextDuty}. Please select one.`,
      };
    }

    // No members available
    logger.warn({ taskId, nextDuty }, 'No team members available for next duty');
    throw new Error(`No team members assigned to ${nextDuty} duty on this project`);
  }

  /**
   * Reassign task to a different duty (skip sequence)
   *
   * @param taskId - The task to reassign
   * @param projectId - The project context
   * @param newDutyName - The new duty to assign to
   * @param userId - The user to assign to (must have this duty)
   * @param reason - Business reason for reassignment
   * @returns TaskRoutingResult
   */
  async reassignTaskDuty(
    taskId: string,
    projectId: string,
    newDutyName: string,
    userId: string,
    reason: string
  ): Promise<TaskRoutingResult> {
    logger.info(
      { taskId, newDutyName, userId, reason },
      'Reassigning task to different duty'
    );

    // Validate user has the target duty
    const hasRequiredDuty = await this.userHasDuty(projectId, userId, newDutyName);
    if (!hasRequiredDuty) {
      throw new Error(`User ${userId} does not have ${newDutyName} duty on this project`);
    }

    // Validate duty exists in project
    const validDuty = await this.isDutyValidForProject(projectId, newDutyName);
    if (!validDuty) {
      throw new Error(`Invalid duty: ${newDutyName}`);
    }

    // Get user name
    const userName = await this.getUserName(userId);

    // Create reassignment record
    return this.assignTaskToMember(taskId, projectId, newDutyName, userId, userName, reason);
  }

  /**
   * Get task duty history (all assignments and transitions)
   *
   * @param taskId - The task
   * @returns Array of duty history entries in chronological order
   */
  async getTaskDutyHistory(taskId: string): Promise<TaskDutyHistoryEntry[]> {
    logger.debug({ taskId }, 'Fetching task duty history');

    // Query implementation would fetch from database
    // Returns chronological list of all duty assignments for this task
    // Placeholder: return empty array
    return [];
  }

  /**
   * Get next duty in the workflow sequence
   *
   * @param currentDutyName - Current duty name
   * @returns Next duty name or null if at end
   */
  private getNextDutyInSequence(currentDutyName: string): string | null {
    const currentIndex = DUTY_SEQUENCE_ORDER.indexOf(currentDutyName as (typeof DUTY_SEQUENCE_ORDER)[number]);

    if (currentIndex === -1) {
      logger.warn({ currentDutyName }, 'Current duty not found in sequence');
      return null;
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= DUTY_SEQUENCE_ORDER.length) {
      // At final duty (Publisher)
      return null;
    }

    return DUTY_SEQUENCE_ORDER[nextIndex];
  }

  /**
   * Check if duty is the special "ALL" duty
   *
   * @param dutyName - The duty name to check
   * @returns true if duty is "ALL"
   */
  private isAllDuty(dutyName: string): boolean {
    return dutyName.toUpperCase() === 'ALL';
  }

  /**
   * Handle special case of ALL duty (assign to all team members)
   *
   * @param taskId - The task
   * @param projectId - The project
   * @param currentDutyName - The ALL duty name
   * @returns TaskRoutingResult with all team members assigned
   */
  private async handleAllDutyRouting(
    taskId: string,
    projectId: string,
    currentDutyName: string
  ): Promise<TaskRoutingResult> {
    logger.info({ taskId, projectId }, 'Handling ALL duty routing');

    // Get all team members with ALL duty
    const allMembers = await this.getTeamMembersForDuty(projectId, currentDutyName);

    if (allMembers.length === 0) {
      throw new Error('No team members assigned to ALL duty on this project');
    }

    logger.info(
      { taskId, allMemberCount: allMembers.length },
      'Assigning task to all team members'
    );

    return {
      taskId,
      status: 'assignAllTeamMembers',
      nextDuty: currentDutyName, // ALL duty doesn't progress sequence
      assignedCount: allMembers.length,
      message: `Task assigned to all ${allMembers.length} team members`,
    };
  }

  /**
   * Assign task to a specific team member
   *
   * @param taskId - The task
   * @param projectId - The project
   * @param dutyName - The duty
   * @param userId - The user to assign to
   * @param userName - User's display name
   * @param reassignmentReason - Optional reason for reassignment
   * @returns TaskRoutingResult
   */
  private async assignTaskToMember(
    taskId: string,
    _projectId: string,
    dutyName: string,
    userId: string,
    userName: string,
    reassignmentReason?: string
  ): Promise<TaskRoutingResult> {
    logger.info(
      {
        taskId,
        dutyName,
        userId,
        userName,
        hasReason: !!reassignmentReason,
      },
      'Assigning task to team member'
    );

    // Create assignment record (would be stored in database)
    // Create duty history entry (would be stored in database)

    return {
      taskId,
      status: 'autoAssigned',
      nextDuty: dutyName,
      assignedToUserId: userId,
      message: `Task assigned to ${userName} (${dutyName})`,
    };
  }

  /**
   * Get all team members available for a duty
   *
   * @param projectId - The project
   * @param dutyName - The duty to query
   * @returns Array of team members with this duty
   */
  private async getTeamMembersForDuty(
    projectId: string,
    dutyName: string
  ): Promise<TeamMemberDuty[]> {
    logger.debug({ projectId, dutyName }, 'Fetching team members for duty');

    // Query implementation would fetch from database
    // Placeholder: return empty array
    return [];
  }

  /**
   * Check if a user has a specific duty on a project
   *
   * @param projectId - The project
   * @param userId - The user
   * @param dutyName - The duty
   * @returns true if user has this duty
   */
  private async userHasDuty(
    projectId: string,
    userId: string,
    dutyName: string
  ): Promise<boolean> {
    logger.debug({ projectId, userId, dutyName }, 'Checking if user has duty');

    // Query implementation would fetch from database
    // Placeholder: return false
    return false;
  }

  /**
   * Validate that a duty exists for a project
   *
   * @param projectId - The project
   * @param dutyName - The duty name
   * @returns true if duty is valid for project
   */
  private async isDutyValidForProject(
    projectId: string,
    dutyName: string
  ): Promise<boolean> {
    logger.debug({ projectId, dutyName }, 'Validating duty for project');

    // Query implementation would check against available duties
    // Standard duties are always valid, custom duties checked separately
    // Placeholder: return true for standard duties
    const standardDuties = ['Developer', 'Design Coordinator', 'System Review', 'QA', 'Final Acceptance Reviewer', 'Publisher'];
    return standardDuties.includes(dutyName) || dutyName.toUpperCase() === 'ALL';
  }

  /**
   * Get a user's display name
   *
   * @param userId - The user
   * @returns User's name
   */
  private async getUserName(userId: string): Promise<string> {
    // Query implementation would fetch from user table
    // Placeholder: return generic name
    return `User ${userId.substring(0, 8)}`;
  }
}

// Export singleton instance
export const taskRoutingService = new TaskRoutingService();
