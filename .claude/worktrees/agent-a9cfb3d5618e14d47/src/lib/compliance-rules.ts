/**
 * Compliance Rule Definitions for Team Assignments
 *
 * This file contains compliance rules for SOC 2 and HiTrust security standards.
 * Rules are defined as prohibited duty combinations that cannot coexist for a single team member.
 *
 * Rules are immutable after startup and used by the ComplianceEngine service.
 */

/**
 * Security standard classification types
 */
export enum SecurityStandard {
  SOC2 = 'SOC2',
  HITRUST = 'HITRUST',
}

/**
 * Available duty types in the system
 */
export enum DutyType {
  DEVELOPER = 'Developer',
  DESIGN_COORDINATOR = 'Design Coordinator',
  SYSTEM_REVIEW = 'System Review',
  QA = 'QA',
  FINAL_ACCEPTANCE_REVIEWER = 'Final Acceptance Reviewer',
  PUBLISHER = 'Publisher',
  SECURITY_TEAM_MANAGER = 'Security Team Manager',
  TEAM_MANAGER = 'Team Manager',
  ALL = 'ALL',
}

/**
 * Fixed duty sequence for task workflow progression
 * Tasks must flow through duties in this exact order
 */
export const DUTY_SEQUENCE_ORDER = [
  DutyType.DEVELOPER,
  DutyType.DESIGN_COORDINATOR,
  DutyType.SYSTEM_REVIEW,
  DutyType.QA,
  DutyType.FINAL_ACCEPTANCE_REVIEWER,
  DutyType.PUBLISHER,
] as const;

/**
 * Prohibited duty combinations for SOC 2 compliance
 *
 * SOC 2 Type II requires separation of duties to ensure adequate segregation of functions.
 * These 7 rules enforce that a single team member cannot perform incompatible duties
 * that could compromise audit controls and change management processes.
 *
 * Key principles:
 * - Developers cannot review their own code (QA, System Review, Final Acceptance)
 * - Code reviewers cannot also develop (System Review cannot be Developer)
 * - Final reviewers must be independent from development and QA activities
 *
 * Each entry specifies duties that cannot coexist for a single team member
 */
export const SOC2_PROHIBITED_COMBINATIONS = [
  {
    ruleId: 'SOC2_DEV_QA_SEPARATION',
    duties: [DutyType.DEVELOPER, DutyType.QA],
    reason: 'Separation of duties: Developer cannot also be QA - prevents self-testing and conflicts of interest',
    standard: SecurityStandard.SOC2,
  },
  {
    ruleId: 'SOC2_DEV_FINAL_REVIEWER_SEPARATION',
    duties: [DutyType.DEVELOPER, DutyType.FINAL_ACCEPTANCE_REVIEWER],
    reason: 'Separation of duties: Developer cannot also be Final Acceptance Reviewer - independent approval required',
    standard: SecurityStandard.SOC2,
  },
  {
    ruleId: 'SOC2_SYSTEM_REVIEW_DEV_SEPARATION',
    duties: [DutyType.SYSTEM_REVIEW, DutyType.DEVELOPER],
    reason: 'Separation of duties: System Review cannot also be Developer - prevents review of own code',
    standard: SecurityStandard.SOC2,
  },
  {
    ruleId: 'SOC2_SYSTEM_REVIEW_QA_SEPARATION',
    duties: [DutyType.SYSTEM_REVIEW, DutyType.QA],
    reason: 'Separation of duties: System Review cannot also be QA - independent assessment required',
    standard: SecurityStandard.SOC2,
  },
  {
    ruleId: 'SOC2_FINAL_REVIEWER_DEV_SEPARATION',
    duties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DEVELOPER],
    reason: 'Separation of duties: Final Acceptance Reviewer cannot also be Developer - prevents self-approval',
    standard: SecurityStandard.SOC2,
  },
  {
    ruleId: 'SOC2_FINAL_REVIEWER_DESIGN_SEPARATION',
    duties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DESIGN_COORDINATOR],
    reason: 'Separation of duties: Final Acceptance Reviewer cannot also be Design Coordinator - independent review required',
    standard: SecurityStandard.SOC2,
  },
  {
    ruleId: 'SOC2_FINAL_REVIEWER_QA_SEPARATION',
    duties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.QA],
    reason: 'Separation of duties: Final Acceptance Reviewer cannot also be QA - final sign-off must be independent',
    standard: SecurityStandard.SOC2,
  },
] as const;

/**
 * Prohibited duty combinations for HiTrust compliance (stricter than SOC 2)
 *
 * HiTrust Common Security Framework (CSF) is stricter than SOC 2 and adds
 * additional separation of duties requirements for healthcare and sensitive data.
 * These 13 rules enforce stronger compartmentalization to prevent unauthorized
 * modifications and ensure audit trails are tamper-proof.
 *
 * Key differences from SOC 2:
 * - Publisher (release) role has additional restrictions
 * - All incompatible duty pairs are explicitly blocked (bidirectional)
 * - Stricter enforcement on system-level access
 *
 * Each entry specifies duties that cannot coexist for a single team member
 */
export const HITRUST_PROHIBITED_COMBINATIONS = [
  {
    ruleId: 'HITRUST_DEV_QA_SEPARATION',
    duties: [DutyType.DEVELOPER, DutyType.QA],
    reason: 'Separation of duties: Developer cannot also be QA',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_DEV_FINAL_REVIEWER_SEPARATION',
    duties: [DutyType.DEVELOPER, DutyType.FINAL_ACCEPTANCE_REVIEWER],
    reason: 'Separation of duties: Developer cannot also be Final Acceptance Reviewer',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_DEV_PUBLISHER_SEPARATION',
    duties: [DutyType.DEVELOPER, DutyType.PUBLISHER],
    reason: 'Separation of duties: Developer cannot also be Publisher (HiTrust stricter requirement) - prevents unapproved code release',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_SYSTEM_REVIEW_DEV_SEPARATION',
    duties: [DutyType.SYSTEM_REVIEW, DutyType.DEVELOPER],
    reason: 'Separation of duties: System Review cannot also be Developer - prevents review of own changes',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_SYSTEM_REVIEW_QA_SEPARATION',
    duties: [DutyType.SYSTEM_REVIEW, DutyType.QA],
    reason: 'Separation of duties: System Review cannot also be QA - independent verification required',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_SYSTEM_REVIEW_PUBLISHER_SEPARATION',
    duties: [DutyType.SYSTEM_REVIEW, DutyType.PUBLISHER],
    reason: 'Separation of duties: System Review cannot also be Publisher (HiTrust requirement) - prevents reviewed code from being released by reviewer',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_FINAL_REVIEWER_DEV_SEPARATION',
    duties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DEVELOPER],
    reason: 'Separation of duties: Final Acceptance Reviewer cannot also be Developer',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_FINAL_REVIEWER_DESIGN_SEPARATION',
    duties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DESIGN_COORDINATOR],
    reason: 'Separation of duties: Final Acceptance Reviewer cannot also be Design Coordinator',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_FINAL_REVIEWER_QA_SEPARATION',
    duties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.QA],
    reason: 'Separation of duties: Final Acceptance Reviewer cannot also be QA',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_FINAL_REVIEWER_PUBLISHER_SEPARATION',
    duties: [DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.PUBLISHER],
    reason: 'Separation of duties: Final Acceptance Reviewer cannot also be Publisher (HiTrust requirement) - prevents approver from releasing own approval',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_PUBLISHER_DEV_SEPARATION',
    duties: [DutyType.PUBLISHER, DutyType.DEVELOPER],
    reason: 'Separation of duties: Publisher cannot also be Developer - prevents unauthorized code release (HiTrust bidirectional check)',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_PUBLISHER_QA_SEPARATION',
    duties: [DutyType.PUBLISHER, DutyType.QA],
    reason: 'Separation of duties: Publisher cannot also be QA - prevents releasing unverified changes',
    standard: SecurityStandard.HITRUST,
  },
  {
    ruleId: 'HITRUST_PUBLISHER_FINAL_REVIEWER_SEPARATION',
    duties: [DutyType.PUBLISHER, DutyType.FINAL_ACCEPTANCE_REVIEWER],
    reason: 'Separation of duties: Publisher cannot also be Final Acceptance Reviewer - prevents release of own approvals (HiTrust requirement)',
    standard: SecurityStandard.HITRUST,
  },
] as const;

/**
 * Default duty types per security classification
 * Used when creating new projects or subscriptions
 */
export const DEFAULT_DUTIES_BY_STANDARD = {
  [SecurityStandard.SOC2]: [
    DutyType.DEVELOPER,
    DutyType.DESIGN_COORDINATOR,
    DutyType.SYSTEM_REVIEW,
    DutyType.QA,
    DutyType.FINAL_ACCEPTANCE_REVIEWER,
    DutyType.PUBLISHER,
    DutyType.SECURITY_TEAM_MANAGER,
    DutyType.TEAM_MANAGER,
  ],
  [SecurityStandard.HITRUST]: [
    DutyType.DEVELOPER,
    DutyType.DESIGN_COORDINATOR,
    DutyType.SYSTEM_REVIEW,
    DutyType.QA,
    DutyType.FINAL_ACCEPTANCE_REVIEWER,
    DutyType.PUBLISHER,
    DutyType.SECURITY_TEAM_MANAGER,
    DutyType.TEAM_MANAGER,
  ],
} as const;

/**
 * Roles that are exempt from duty conflict restrictions
 *
 * Management roles (Team Manager, Security Team Manager) are exempt from
 * separation of duties requirements because they have oversight responsibility
 * across all duties. These roles can be assigned alongside any other duty
 * without triggering compliance violations.
 *
 * These duties can be assigned with any other duty without restriction
 */
export const EXEMPT_FROM_CONFLICTS: DutyType[] = [
  DutyType.SECURITY_TEAM_MANAGER,
  DutyType.TEAM_MANAGER,
];

/**
 * Get the applicable compliance rules for a security standard
 * @param standard The security standard (SOC2 or HITRUST)
 * @returns Array of prohibited duty combinations
 */
export function getProhibitedCombinationsByStandard(
  standard: SecurityStandard
): typeof SOC2_PROHIBITED_COMBINATIONS | typeof HITRUST_PROHIBITED_COMBINATIONS {
  return standard === SecurityStandard.HITRUST
    ? HITRUST_PROHIBITED_COMBINATIONS
    : SOC2_PROHIBITED_COMBINATIONS;
}

/**
 * Check if two duties conflict under a given security standard
 * @param duty1 First duty to check
 * @param duty2 Second duty to check
 * @param standard The security standard to validate against
 * @returns true if the duties conflict, false otherwise
 */
export function dutiesConflict(
  duty1: string,
  duty2: string,
  standard: SecurityStandard
): boolean {
  // Check if either duty is exempt from conflicts
  if (
    EXEMPT_FROM_CONFLICTS.includes(duty1 as DutyType) ||
    EXEMPT_FROM_CONFLICTS.includes(duty2 as DutyType)
  ) {
    return false;
  }

  const rules = getProhibitedCombinationsByStandard(standard);

  // Check if this combination violates any rule
  for (const rule of rules) {
    if (
      (rule.duties[0] === duty1 && rule.duties[1] === duty2) ||
      (rule.duties[0] === duty2 && rule.duties[1] === duty1)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get conflicting rules for a set of duties
 * @param duties Array of duty names
 * @param standard The security standard to validate against
 * @returns Array of violated rules
 */
export function getConflictingRules(
  duties: string[],
  standard: SecurityStandard
) {
  const rules = getProhibitedCombinationsByStandard(standard);
  const violatedRules = [];

  for (const rule of rules) {
    // Check if all duties in this rule are present in the input
    const [duty1, duty2] = rule.duties;
    if (duties.includes(duty1) && duties.includes(duty2)) {
      violatedRules.push(rule);
    }
  }

  return violatedRules;
}
