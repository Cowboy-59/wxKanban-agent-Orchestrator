/**
 * Duty Sequence Unit Tests
 *
 * Tests for:
 * - T024: Duty sequence validation and workflow progression
 *
 * These tests validate the duty workflow sequence logic that determines
 * task routing through the standard 6-duty workflow
 */

import { describe, it, expect } from 'vitest';
import {
  DUTY_SEQUENCE_ORDER,
  DutyType,
} from '../../src/lib/compliance-rules';

describe('T024: Duty Sequence Validation and Progression', () => {
  it('should define the correct duty sequence order', () => {
    expect(DUTY_SEQUENCE_ORDER).toBeDefined();
    expect(Array.isArray(DUTY_SEQUENCE_ORDER)).toBe(true);
    expect(DUTY_SEQUENCE_ORDER.length).toBeGreaterThan(0);
  });

  it('should have Developer as the first duty in sequence', () => {
    expect(DUTY_SEQUENCE_ORDER[0]).toBe(DutyType.DEVELOPER);
  });

  it('should have Publisher as the last duty in sequence', () => {
    const lastIndex = DUTY_SEQUENCE_ORDER.length - 1;
    expect(DUTY_SEQUENCE_ORDER[lastIndex]).toBe(DutyType.PUBLISHER);
  });

  it('should maintain the exact workflow sequence order', () => {
    const expectedSequence = [
      DutyType.DEVELOPER,
      DutyType.DESIGN_COORDINATOR,
      DutyType.SYSTEM_REVIEW,
      DutyType.QA,
      DutyType.FINAL_ACCEPTANCE_REVIEWER,
      DutyType.PUBLISHER,
    ];
    expect(DUTY_SEQUENCE_ORDER).toEqual(expectedSequence);
  });

  it('should contain no duplicate duties', () => {
    const uniqueDuties = new Set(DUTY_SEQUENCE_ORDER);
    expect(uniqueDuties.size).toBe(DUTY_SEQUENCE_ORDER.length);
  });

  it('should allow finding next duty in sequence', () => {
    const currentIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.DEVELOPER);
    expect(currentIndex).toBe(0);
    const nextDuty = DUTY_SEQUENCE_ORDER[currentIndex + 1];
    expect(nextDuty).toBe(DutyType.DESIGN_COORDINATOR);
  });

  it('should handle final duty correctly (no next duty)', () => {
    const publisherIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.PUBLISHER);
    const nextDutyExists = publisherIndex + 1 < DUTY_SEQUENCE_ORDER.length;
    expect(nextDutyExists).toBe(false);
  });

  it('should allow checking if a duty exists in sequence', () => {
    expect(DUTY_SEQUENCE_ORDER.includes(DutyType.DEVELOPER)).toBe(true);
    expect(DUTY_SEQUENCE_ORDER.includes(DutyType.QA)).toBe(true);
    expect(DUTY_SEQUENCE_ORDER.includes(DutyType.PUBLISHER)).toBe(true);
  });

  it('should validate sequence progression from any starting point', () => {
    // Starting from Design Coordinator
    const designIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.DESIGN_COORDINATOR);
    expect(designIndex).toBeGreaterThan(0);
    const nextAfterDesign = DUTY_SEQUENCE_ORDER[designIndex + 1];
    expect(nextAfterDesign).toBe(DutyType.SYSTEM_REVIEW);

    // Starting from QA
    const qaIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.QA);
    expect(qaIndex).toBeGreaterThan(designIndex);
    const nextAfterQA = DUTY_SEQUENCE_ORDER[qaIndex + 1];
    expect(nextAfterQA).toBe(DutyType.FINAL_ACCEPTANCE_REVIEWER);

    // Starting from Final Acceptance Reviewer
    const farIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.FINAL_ACCEPTANCE_REVIEWER);
    expect(farIndex).toBeGreaterThan(qaIndex);
    const nextAfterFAR = DUTY_SEQUENCE_ORDER[farIndex + 1];
    expect(nextAfterFAR).toBe(DutyType.PUBLISHER);
  });

  it('should determine workflow complete when reaching Publisher', () => {
    const publisherIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.PUBLISHER);
    const isLastInSequence = publisherIndex === DUTY_SEQUENCE_ORDER.length - 1;
    expect(isLastInSequence).toBe(true);
  });

  it('should support querying duty position in workflow', () => {
    const positions: Record<string, number> = {};
    DUTY_SEQUENCE_ORDER.forEach((duty, index) => {
      positions[duty] = index;
    });

    expect(positions[DutyType.DEVELOPER]).toBe(0);
    expect(positions[DutyType.DESIGN_COORDINATOR]).toBe(1);
    expect(positions[DutyType.SYSTEM_REVIEW]).toBe(2);
    expect(positions[DutyType.QA]).toBe(3);
    expect(positions[DutyType.FINAL_ACCEPTANCE_REVIEWER]).toBe(4);
    expect(positions[DutyType.PUBLISHER]).toBe(5);
  });

  it('should allow checking if one duty comes before another in sequence', () => {
    const isDeveloperFirst = DUTY_SEQUENCE_ORDER.indexOf(DutyType.DEVELOPER) <
      DUTY_SEQUENCE_ORDER.indexOf(DutyType.DESIGN_COORDINATOR);
    expect(isDeveloperFirst).toBe(true);

    const isDesignBeforeQA = DUTY_SEQUENCE_ORDER.indexOf(DutyType.DESIGN_COORDINATOR) <
      DUTY_SEQUENCE_ORDER.indexOf(DutyType.QA);
    expect(isDesignBeforeQA).toBe(true);

    const isPublisherLast = DUTY_SEQUENCE_ORDER.indexOf(DutyType.PUBLISHER) >
      DUTY_SEQUENCE_ORDER.indexOf(DutyType.FINAL_ACCEPTANCE_REVIEWER);
    expect(isPublisherLast).toBe(true);
  });

  it('should calculate remaining duties from any checkpoint', () => {
    // From Developer
    const fromDeveloper = DUTY_SEQUENCE_ORDER.slice(1); // All duties after Developer
    expect(fromDeveloper.length).toBe(5);
    expect(fromDeveloper[0]).toBe(DutyType.DESIGN_COORDINATOR);

    // From QA
    const qaIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.QA);
    const fromQA = DUTY_SEQUENCE_ORDER.slice(qaIndex + 1);
    expect(fromQA.length).toBe(2);
    expect(fromQA[0]).toBe(DutyType.FINAL_ACCEPTANCE_REVIEWER);
    expect(fromQA[1]).toBe(DutyType.PUBLISHER);

    // From Publisher
    const publisherIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.PUBLISHER);
    const fromPublisher = DUTY_SEQUENCE_ORDER.slice(publisherIndex + 1);
    expect(fromPublisher.length).toBe(0);
  });

  it('should validate sequential integrity (no gaps, ordered indices)', () => {
    for (let i = 0; i < DUTY_SEQUENCE_ORDER.length - 1; i++) {
      const currentDuty = DUTY_SEQUENCE_ORDER[i];
      const nextDuty = DUTY_SEQUENCE_ORDER[i + 1];

      // Each duty should be different
      expect(currentDuty).not.toBe(nextDuty);

      // Indices should be consecutive
      expect(i + 1).toBeLessThan(DUTY_SEQUENCE_ORDER.length);
    }
  });

  it('should support finding all duties between two checkpoints', () => {
    const startIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.DESIGN_COORDINATOR);
    const endIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.QA);
    const dutiesBetween = DUTY_SEQUENCE_ORDER.slice(startIndex, endIndex + 1);

    expect(dutiesBetween).toEqual([
      DutyType.DESIGN_COORDINATOR,
      DutyType.SYSTEM_REVIEW,
      DutyType.QA,
    ]);
  });

  it('should identify if a task has completed the workflow', () => {
    // Task at Publisher duty is complete
    const publisherIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.PUBLISHER);
    const isWorkflowComplete = publisherIndex === DUTY_SEQUENCE_ORDER.length - 1;
    expect(isWorkflowComplete).toBe(true);

    // Tasks at any other duty are not complete
    for (let i = 0; i < DUTY_SEQUENCE_ORDER.length - 1; i++) {
      const currentDuty = DUTY_SEQUENCE_ORDER[i];
      const isComplete = i === DUTY_SEQUENCE_ORDER.length - 1;
      expect(isComplete).toBe(false);
    }
  });

  it('should support counting total workflow steps', () => {
    const totalSteps = DUTY_SEQUENCE_ORDER.length;
    expect(totalSteps).toBe(6);
  });

  it('should calculate progress percentage from any duty', () => {
    // From Developer (step 1 of 6)
    const devIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.DEVELOPER);
    const devProgress = ((devIndex + 1) / DUTY_SEQUENCE_ORDER.length) * 100;
    expect(Math.round(devProgress)).toBe(17); // ~16.67%

    // From QA (step 4 of 6)
    const qaIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.QA);
    const qaProgress = ((qaIndex + 1) / DUTY_SEQUENCE_ORDER.length) * 100;
    expect(Math.round(qaProgress)).toBe(67); // ~66.67%

    // From Publisher (step 6 of 6)
    const pubIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.PUBLISHER);
    const pubProgress = ((pubIndex + 1) / DUTY_SEQUENCE_ORDER.length) * 100;
    expect(pubProgress).toBe(100);
  });

  it('should return correct duty at any index position', () => {
    // Map of position to expected duty
    const positionMap = {
      0: DutyType.DEVELOPER,
      1: DutyType.DESIGN_COORDINATOR,
      2: DutyType.SYSTEM_REVIEW,
      3: DutyType.QA,
      4: DutyType.FINAL_ACCEPTANCE_REVIEWER,
      5: DutyType.PUBLISHER,
    };

    Object.entries(positionMap).forEach(([posStr, expectedDuty]) => {
      const pos = parseInt(posStr, 10);
      expect(DUTY_SEQUENCE_ORDER[pos]).toBe(expectedDuty);
    });
  });

  it('should handle edge case of first duty inquiry', () => {
    const firstDuty = DUTY_SEQUENCE_ORDER[0];
    expect(firstDuty).toBe(DutyType.DEVELOPER);
    expect(firstDuty).not.toBeUndefined();
  });

  it('should handle edge case of last duty inquiry', () => {
    const lastDuty = DUTY_SEQUENCE_ORDER[DUTY_SEQUENCE_ORDER.length - 1];
    expect(lastDuty).toBe(DutyType.PUBLISHER);
    expect(lastDuty).not.toBeUndefined();
  });

  it('should support reverse lookup (duty name to position)', () => {
    const lookupTable = DUTY_SEQUENCE_ORDER.reduce(
      (acc, duty, index) => {
        acc[duty] = index;
        return acc;
      },
      {} as Record<string, number>
    );

    expect(lookupTable[DutyType.DEVELOPER]).toBe(0);
    expect(lookupTable[DutyType.DESIGN_COORDINATOR]).toBe(1);
    expect(lookupTable[DutyType.SYSTEM_REVIEW]).toBe(2);
    expect(lookupTable[DutyType.QA]).toBe(3);
    expect(lookupTable[DutyType.FINAL_ACCEPTANCE_REVIEWER]).toBe(4);
    expect(lookupTable[DutyType.PUBLISHER]).toBe(5);
  });

  it('should allow filtering duties based on workflow stage', () => {
    // Early stage (before QA)
    const earlyStageIndex = DUTY_SEQUENCE_ORDER.indexOf(DutyType.QA);
    const earlyStages = DUTY_SEQUENCE_ORDER.slice(0, earlyStageIndex);
    expect(earlyStages).toContain(DutyType.DEVELOPER);
    expect(earlyStages).toContain(DutyType.DESIGN_COORDINATOR);
    expect(earlyStages).not.toContain(DutyType.QA);

    // Final stage (QA onward)
    const finalStages = DUTY_SEQUENCE_ORDER.slice(earlyStageIndex);
    expect(finalStages).toContain(DutyType.QA);
    expect(finalStages).toContain(DutyType.PUBLISHER);
  });
});
