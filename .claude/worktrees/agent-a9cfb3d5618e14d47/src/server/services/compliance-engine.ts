/**
 * Compliance Engine Service
 *
 * Handles all compliance rule validation, violation detection, and audit logging
 * for SOC 2 and HiTrust security standards.
 *
 * Implements: T032-T035
 * - T032: Compliance rule matrix implementation
 * - T033: Duty assignment validation
 * - T034: Rule lookup and violation checking
 * - T035: Audit logging for compliance violations
 */

import { logger } from '~/lib/logger';
import {
  dutiesConflict,
  getConflictingRules,
  SecurityStandard,
  DutyType,
} from '~/lib/compliance-rules';

/**
 * Represents a compliance violation when a duty assignment conflicts with rules
 */
export interface ComplianceViolation {
  ruleId: string;
  reason: string;
  standard: SecurityStandard;
  duties: string[];
  severity: 'warning' | 'error';
}

/**
 * Represents a compliance override for audit trail
 */
export interface ComplianceOverride {
  complianceOverrideId: string;
  projectId: string;
  userId: string;
  dutyName: string;
  violatedRules: string[];
  reason: string;
  overriddenBy: string; // Admin/Team Manager who approved
  standard: SecurityStandard;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Validation result for a potential duty assignment
 */
export interface DutyAssignmentValidation {
  isValid: boolean;
  violations: ComplianceViolation[];
  requiresOverride: boolean;
  standard: SecurityStandard;
}

/**
 * ComplianceEngine Service
 *
 * Core service for validating duty assignments against security standards.
 * Enforces separation of duties rules and tracks compliance overrides.
 */
export class ComplianceEngine {
  /**
   * Validate a proposed duty assignment against compliance rules
   *
   * @param projectId - The project where duty is being assigned
   * @param userId - The user being assigned the duty
   * @param dutyName - The duty name being assigned
   * @param currentDuties - Array of duties user already has
   * @param standard - Security standard to validate against (SOC2 or HITRUST)
   * @returns DutyAssignmentValidation result
   */
  validateDutyAssignment(
    projectId: string,
    userId: string,
    dutyName: string,
    currentDuties: string[],
    standard: SecurityStandard
  ): DutyAssignmentValidation {
    logger.debug(
      { projectId, userId, dutyName, standard },
      'Validating duty assignment'
    );

    // Add the proposed duty to current duties to check full set
    const allDutiesAfterAssignment = [...currentDuties, dutyName];

    // Get all violations for this duty combination
    const violations = getConflictingRules(
      allDutiesAfterAssignment as DutyType[],
      standard
    );

    const isValid = violations.length === 0;

    logger.info(
      { projectId, userId, dutyName, standard, isValid, violationCount: violations.length },
      isValid ? 'Duty assignment is valid' : 'Duty assignment has violations'
    );

    return {
      isValid,
      violations: violations.map(rule => ({
        ruleId: rule.ruleId,
        reason: rule.reason,
        standard: rule.standard,
        duties: Array.from(rule.duties),
        severity: 'error', // Violations are errors in compliance context
      })),
      requiresOverride: !isValid,
      standard,
    };
  }

  /**
   * Check if two duties conflict under a given security standard
   *
   * @param duty1 - First duty
   * @param duty2 - Second duty
   * @param standard - Security standard (SOC2 or HITRUST)
   * @returns true if duties conflict, false otherwise
   */
  dutiesConflict(
    duty1: DutyType,
    duty2: DutyType,
    standard: SecurityStandard
  ): boolean {
    return dutiesConflict(duty1, duty2, standard);
  }

  /**
   * Get all rules that would be violated for a set of duties
   *
   * @param duties - Array of duty names
   * @param standard - Security standard
   * @returns Array of violated rules
   */
  getViolations(duties: DutyType[], standard: SecurityStandard): ComplianceViolation[] {
    const violatedRules = getConflictingRules(duties, standard);

    return violatedRules.map(rule => ({
      ruleId: rule.ruleId,
      reason: rule.reason,
      standard: rule.standard,
      duties: Array.from(rule.duties),
      severity: 'error',
    }));
  }

  /**
   * Get all rules applicable to a security standard
   *
   * @param standard - Security standard (SOC2 or HITRUST)
   * @returns Array of all applicable rules for the standard
   */
  getRulesByStandard(standard: SecurityStandard): Array<{
    ruleId: string;
    reason: string;
    prohibitedDuties: DutyType[];
  }> {
    logger.debug({ standard }, 'Fetching rules for standard');

    const rules: Array<{
      ruleId: string;
      reason: string;
      prohibitedDuties: DutyType[];
    }> = [];

    // For SOC 2, return SOC 2 rules
    if (standard === SecurityStandard.SOC2) {
      return [
        {
          ruleId: 'SOC2_DEV_QA_SEPARATION',
          reason: 'Developer cannot also be QA per SOC 2 separation of duties',
          prohibitedDuties: [DutyType.DEVELOPER, DutyType.QA],
        },
        {
          ruleId: 'SOC2_DEV_FAR_SEPARATION',
          reason: 'Developer cannot also be Final Acceptance Reviewer',
          prohibitedDuties: [DutyType.DEVELOPER, DutyType.FINAL_ACCEPTANCE_REVIEWER],
        },
        {
          ruleId: 'SOC2_SYSTEMREVIEW_DEV_SEPARATION',
          reason: 'System Review cannot also be Developer',
          prohibitedDuties: [DutyType.SYSTEM_REVIEW, DutyType.DEVELOPER],
        },
        {
          ruleId: 'SOC2_SYSTEMREVIEW_QA_SEPARATION',
          reason: 'System Review cannot also be QA',
          prohibitedDuties: [DutyType.SYSTEM_REVIEW, DutyType.QA],
        },
        {
          ruleId: 'SOC2_FAR_DEV_SEPARATION',
          reason: 'Final Acceptance Reviewer cannot also be Developer',
          prohibitedDuties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DEVELOPER],
        },
        {
          ruleId: 'SOC2_FAR_DESIGN_SEPARATION',
          reason: 'Final Acceptance Reviewer cannot also be Design Coordinator',
          prohibitedDuties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DESIGN_COORDINATOR],
        },
        {
          ruleId: 'SOC2_FAR_QA_SEPARATION',
          reason: 'Final Acceptance Reviewer cannot also be QA',
          prohibitedDuties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.QA],
        },
      ];
    }

    // For HiTrust, return all SOC 2 rules plus additional stricter rules
    if (standard === SecurityStandard.HITRUST) {
      // Start with all SOC 2 rules
      const socRules = this.getRulesByStandard(SecurityStandard.SOC2);
      rules.push(...socRules);

      // Add HiTrust-specific stricter rules
      const hitrustOnlyRules = [
        {
          ruleId: 'HITRUST_DEV_PUBLISHER_SEPARATION',
          reason: 'Developer cannot also be Publisher per HiTrust stricter rules',
          prohibitedDuties: [DutyType.DEVELOPER, DutyType.PUBLISHER],
        },
        {
          ruleId: 'HITRUST_SYSTEMREVIEW_PUBLISHER_SEPARATION',
          reason: 'System Review cannot also be Publisher',
          prohibitedDuties: [DutyType.SYSTEM_REVIEW, DutyType.PUBLISHER],
        },
        {
          ruleId: 'HITRUST_FAR_PUBLISHER_SEPARATION',
          reason: 'Final Acceptance Reviewer cannot also be Publisher',
          prohibitedDuties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.PUBLISHER],
        },
        {
          ruleId: 'HITRUST_PUBLISHER_QA_SEPARATION',
          reason: 'Publisher cannot also be QA',
          prohibitedDuties: [DutyType.PUBLISHER, DutyType.QA],
        },
      ];

      rules.push(...hitrustOnlyRules);
      return rules;
    }

    return rules;
  }

  /**
   * Log a compliance override for audit trail
   *
   * This creates an immutable record that a compliance rule was overridden.
   * Used for compliance reporting and audit purposes.
   *
   * @param override - The compliance override details
   * @returns The created ComplianceOverride record
   */
  logComplianceOverride(override: Omit<ComplianceOverride, 'complianceOverrideId' | 'createdAt' | 'updatedAt'>): ComplianceOverride {
    const now = new Date();
    const complianceOverrideId = crypto.randomUUID();

    logger.warn(
      {
        complianceOverrideId,
        projectId: override.projectId,
        userId: override.userId,
        dutyName: override.dutyName,
        violatedRules: override.violatedRules,
        standard: override.standard,
        overriddenBy: override.overriddenBy,
      },
      'Compliance override recorded for audit trail'
    );

    return {
      ...override,
      complianceOverrideId,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Validate override reason meets minimum length requirement
   *
   * @param reason - The override reason text
   * @returns true if reason is valid (>= 50 chars), false otherwise
   */
  validateOverrideReason(reason: string): boolean {
    const isValid = reason.length >= 50;

    if (!isValid) {
      logger.warn(
        { reasonLength: reason?.length ?? 0 },
        'Override reason too short (must be >= 50 characters)'
      );
    }

    return isValid;
  }

  /**
   * Check if a user's role is exempt from compliance checks
   *
   * Exempt roles: Security Team Manager, Team Manager
   * These roles can be assigned any combination of duties without violation
   *
   * @param roleOrDuty - The role/duty to check
   * @returns true if role is exempt from compliance checks
   */
  isExemptRole(roleOrDuty: string): boolean {
    const exemptRoles = [
      DutyType.SECURITY_TEAM_MANAGER,
      DutyType.TEAM_MANAGER,
    ];

    return exemptRoles.includes(roleOrDuty as DutyType);
  }

  /**
   * Get compliance status summary for a user's duties
   *
   * @param duties - Array of duties assigned to user
   * @param standard - Security standard
   * @returns Summary of compliance status
   */
  getComplianceStatus(
    duties: DutyType[],
    standard: SecurityStandard
  ): {
    compliant: boolean;
    violationCount: number;
    violations: ComplianceViolation[];
  } {
    const violations = this.getViolations(duties, standard);

    return {
      compliant: violations.length === 0,
      violationCount: violations.length,
      violations,
    };
  }
}

// Export singleton instance
export const complianceEngine = new ComplianceEngine();
