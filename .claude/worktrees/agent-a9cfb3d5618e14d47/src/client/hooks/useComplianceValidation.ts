/**
 * Hook: useComplianceValidation
 *
 * Validates duty assignments against compliance rules (SOC 2 / HiTrust).
 * Handles: POST /api/compliance/validate
 *
 * Implements T066
 */

import { useMutation } from '@tanstack/react-query';

interface ComplianceViolation {
  ruleId: string;
  reason: string;
  standard: 'SOC2' | 'HITRUST';
  duties: string[];
  severity: 'error' | 'warning';
}

interface ComplianceValidationRequest {
  projectId: string;
  userId: string;
  dutyNames: string[];
  securityStandard: 'SOC2' | 'HITRUST';
}

interface ComplianceValidationResponse {
  isValid: boolean;
  violations: ComplianceViolation[];
  standard: 'SOC2' | 'HITRUST';
}

/**
 * Hook to validate duty assignments against compliance rules
 */
export function useComplianceValidation() {
  const validate = useMutation({
    mutationFn: async (
      request: ComplianceValidationRequest
    ): Promise<ComplianceValidationResponse> => {
      const response = await fetch('/api/compliance/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      // Return both valid and invalid responses
      // The component will handle the violations
      return data;
    },
  });

  /**
   * Check if a proposed assignment would violate compliance rules
   * @param projectId - Project ID
   * @param userId - User to assign
   * @param newDutyName - Duty to assign
   * @param existingDutyNames - Duties user already has
   * @param standard - Security standard (SOC2 or HiTrust)
   * @returns Promise with validation result (may include violations)
   */
  const checkViolations = async (
    projectId: string,
    userId: string,
    newDutyName: string,
    existingDutyNames: string[],
    standard: 'SOC2' | 'HITRUST'
  ): Promise<ComplianceValidationResponse> => {
    return validate.mutateAsync({
      projectId,
      userId,
      dutyNames: [...existingDutyNames, newDutyName],
      securityStandard: standard,
    });
  };

  return {
    validate,
    checkViolations,
  };
}
