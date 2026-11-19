/**
 * Compliance Engine Unit Tests
 *
 * Tests for:
 * - T021: SOC 2 rule validation
 * - T022: HiTrust rule validation
 * - T023: Compliance rule matrix evaluation
 *
 * These tests validate the compliance rule logic in src/lib/compliance-rules.ts
 */

import { describe, it, expect } from 'vitest';
import {
  dutiesConflict,
  getConflictingRules,
  SecurityStandard,
  DutyType,
} from '../../src/lib/compliance-rules';

describe('T021: SOC 2 Rule Validation', () => {
  it('should detect Developer + QA conflict (SOC 2)', () => {
    const conflict = dutiesConflict(
      DutyType.DEVELOPER,
      DutyType.QA,
      SecurityStandard.SOC2
    );
    expect(conflict).toBe(true);
  });

  it('should detect Developer + Final Acceptance Reviewer conflict (SOC 2)', () => {
    const conflict = dutiesConflict(
      DutyType.DEVELOPER,
      DutyType.FINAL_ACCEPTANCE_REVIEWER,
      SecurityStandard.SOC2
    );
    expect(conflict).toBe(true);
  });

  it('should detect System Review + Developer conflict (SOC 2)', () => {
    const conflict = dutiesConflict(
      DutyType.SYSTEM_REVIEW,
      DutyType.DEVELOPER,
      SecurityStandard.SOC2
    );
    expect(conflict).toBe(true);
  });

  it('should detect System Review + QA conflict (SOC 2)', () => {
    const conflict = dutiesConflict(
      DutyType.SYSTEM_REVIEW,
      DutyType.QA,
      SecurityStandard.SOC2
    );
    expect(conflict).toBe(true);
  });

  it('should detect Final Acceptance Reviewer conflicts (SOC 2)', () => {
    expect(dutiesConflict(DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DEVELOPER, SecurityStandard.SOC2)).toBe(true);
    expect(dutiesConflict(DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DESIGN_COORDINATOR, SecurityStandard.SOC2)).toBe(true);
    expect(dutiesConflict(DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.QA, SecurityStandard.SOC2)).toBe(true);
  });

  it('should allow Security Team Manager with any other duty (SOC 2)', () => {
    expect(dutiesConflict(DutyType.SECURITY_TEAM_MANAGER, DutyType.DEVELOPER, SecurityStandard.SOC2)).toBe(false);
    expect(dutiesConflict(DutyType.SECURITY_TEAM_MANAGER, DutyType.QA, SecurityStandard.SOC2)).toBe(false);
    expect(dutiesConflict(DutyType.SECURITY_TEAM_MANAGER, DutyType.FINAL_ACCEPTANCE_REVIEWER, SecurityStandard.SOC2)).toBe(false);
  });

  it('should allow Team Manager with any other duty (SOC 2)', () => {
    expect(dutiesConflict(DutyType.TEAM_MANAGER, DutyType.DEVELOPER, SecurityStandard.SOC2)).toBe(false);
    expect(dutiesConflict(DutyType.TEAM_MANAGER, DutyType.FINAL_ACCEPTANCE_REVIEWER, SecurityStandard.SOC2)).toBe(false);
  });

  it('should allow Developer + Publisher (SOC 2)', () => {
    const conflict = dutiesConflict(
      DutyType.DEVELOPER,
      DutyType.PUBLISHER,
      SecurityStandard.SOC2
    );
    expect(conflict).toBe(false);
  });

  it('should allow Design Coordinator with other duties (SOC 2)', () => {
    expect(dutiesConflict(DutyType.DESIGN_COORDINATOR, DutyType.DEVELOPER, SecurityStandard.SOC2)).toBe(false);
    expect(dutiesConflict(DutyType.DESIGN_COORDINATOR, DutyType.QA, SecurityStandard.SOC2)).toBe(false);
  });
});

describe('T022: HiTrust Rule Validation', () => {
  it('should inherit all SOC 2 conflicts in HiTrust', () => {
    // All SOC 2 conflicts should also be HiTrust conflicts
    expect(dutiesConflict(DutyType.DEVELOPER, DutyType.QA, SecurityStandard.HITRUST)).toBe(true);
    expect(dutiesConflict(DutyType.SYSTEM_REVIEW, DutyType.QA, SecurityStandard.HITRUST)).toBe(true);
    expect(dutiesConflict(DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.DEVELOPER, SecurityStandard.HITRUST)).toBe(true);
  });

  it('should have stricter rules: Developer + Publisher conflict (HiTrust only)', () => {
    // Allowed in SOC 2
    expect(dutiesConflict(DutyType.DEVELOPER, DutyType.PUBLISHER, SecurityStandard.SOC2)).toBe(false);

    // Prohibited in HiTrust
    expect(dutiesConflict(DutyType.DEVELOPER, DutyType.PUBLISHER, SecurityStandard.HITRUST)).toBe(true);
  });

  it('should have stricter rules: System Review + Publisher conflict (HiTrust only)', () => {
    // Allowed in SOC 2
    expect(dutiesConflict(DutyType.SYSTEM_REVIEW, DutyType.PUBLISHER, SecurityStandard.SOC2)).toBe(false);

    // Prohibited in HiTrust
    expect(dutiesConflict(DutyType.SYSTEM_REVIEW, DutyType.PUBLISHER, SecurityStandard.HITRUST)).toBe(true);
  });

  it('should have stricter rules: Final Acceptance Reviewer + Publisher conflict (HiTrust only)', () => {
    // Allowed in SOC 2
    expect(dutiesConflict(DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.PUBLISHER, SecurityStandard.SOC2)).toBe(false);

    // Prohibited in HiTrust
    expect(dutiesConflict(DutyType.FINAL_ACCEPTANCE_REVIEWER, DutyType.PUBLISHER, SecurityStandard.HITRUST)).toBe(true);
  });

  it('should have stricter rules: Publisher conflicts (HiTrust only)', () => {
    expect(dutiesConflict(DutyType.PUBLISHER, DutyType.DEVELOPER, SecurityStandard.HITRUST)).toBe(true);
    expect(dutiesConflict(DutyType.PUBLISHER, DutyType.QA, SecurityStandard.HITRUST)).toBe(true);
    expect(dutiesConflict(DutyType.PUBLISHER, DutyType.FINAL_ACCEPTANCE_REVIEWER, SecurityStandard.HITRUST)).toBe(true);
  });

  it('should allow Security Team Manager with any duty (HiTrust)', () => {
    expect(dutiesConflict(DutyType.SECURITY_TEAM_MANAGER, DutyType.DEVELOPER, SecurityStandard.HITRUST)).toBe(false);
    expect(dutiesConflict(DutyType.SECURITY_TEAM_MANAGER, DutyType.PUBLISHER, SecurityStandard.HITRUST)).toBe(false);
  });

  it('should allow Team Manager and Design Coordinator with any duty (HiTrust)', () => {
    expect(dutiesConflict(DutyType.TEAM_MANAGER, DutyType.PUBLISHER, SecurityStandard.HITRUST)).toBe(false);
    expect(dutiesConflict(DutyType.DESIGN_COORDINATOR, DutyType.DEVELOPER, SecurityStandard.HITRUST)).toBe(false);
  });
});

describe('T023: Compliance Rule Matrix Evaluation', () => {
  it('should get all conflicting rules for a set of duties (SOC 2)', () => {
    const violations = getConflictingRules(
      [DutyType.DEVELOPER, DutyType.QA],
      SecurityStandard.SOC2
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toHaveProperty('ruleId');
    expect(violations[0].ruleId).toContain('SOC2');
  });

  it('should get all conflicting rules for a set of duties (HiTrust)', () => {
    const violations = getConflictingRules(
      [DutyType.DEVELOPER, DutyType.PUBLISHER],
      SecurityStandard.HITRUST
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].standard).toBe(SecurityStandard.HITRUST);
  });

  it('should return empty array when no conflicts', () => {
    const violations = getConflictingRules(
      [DutyType.DEVELOPER, DutyType.DESIGN_COORDINATOR],
      SecurityStandard.SOC2
    );
    expect(violations).toEqual([]);
  });

  it('should handle multiple violations', () => {
    // Developer cannot be with QA or Final Acceptance Reviewer
    const violations = getConflictingRules(
      [DutyType.DEVELOPER, DutyType.QA, DutyType.FINAL_ACCEPTANCE_REVIEWER],
      SecurityStandard.SOC2
    );
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it('should exclude exempt roles from violations', () => {
    // Security Team Manager + Developer + QA should have no violations
    // because Security Team Manager is exempt from conflicts
    const violations = getConflictingRules(
      [DutyType.SECURITY_TEAM_MANAGER, DutyType.DEVELOPER, DutyType.QA],
      SecurityStandard.SOC2
    );
    // Developer + QA still conflict, but Security Team Manager doesn't add violations
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every(v => !v.ruleId.includes('SECURITY_TEAM_MANAGER'))).toBe(true);
  });

  it('should return rule details (ruleId, reason, standard)', () => {
    const violations = getConflictingRules(
      [DutyType.DEVELOPER, DutyType.QA],
      SecurityStandard.SOC2
    );
    violations.forEach(rule => {
      expect(rule.ruleId).toBeTruthy();
      expect(rule.reason).toBeTruthy();
      expect(rule.standard).toBe(SecurityStandard.SOC2);
      expect(rule.duties).toBeDefined();
      expect(Array.isArray(rule.duties)).toBe(true);
    });
  });
});
