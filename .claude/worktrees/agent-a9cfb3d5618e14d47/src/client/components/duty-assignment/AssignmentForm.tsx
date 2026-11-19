/**
 * Component: DutyAssignmentForm
 *
 * Form for assigning duties to team members with compliance validation.
 * Features:
 * - Project and team member selection
 * - Available duties dropdown
 * - Form validation and error handling
 * - Compliance violation detection
 *
 * Implements T060
 */

import React, { useState } from 'react';
import { useDutyAssignment } from '../../hooks/useDutyAssignment';
import { useComplianceValidation } from '../../hooks/useComplianceValidation';
import { ComplianceWarning } from './ComplianceWarning';

interface DutyAssignmentFormProps {
  projectId: string;
  teamMembers: Array<{
    userId: string;
    userName: string;
    email: string;
  }>;
  securityStandard: 'SOC2' | 'HITRUST';
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface FormData {
  selectedUserId: string;
  selectedDuty: string;
  overrideReason?: string;
}

export const DutyAssignmentForm: React.FC<DutyAssignmentFormProps> = ({
  projectId,
  teamMembers,
  securityStandard,
  onSuccess,
  onError,
}) => {
  const [formData, setFormData] = useState<FormData>({
    selectedUserId: '',
    selectedDuty: '',
  });

  const [violations, setViolations] = useState<any[] | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { assignDuty, availableDuties, assignmentsByUser } =
    useDutyAssignment(projectId);
  const { checkViolations } = useComplianceValidation();

  // Get assignments for selected user
  const userAssignments = formData.selectedUserId
    ? assignmentsByUser(formData.selectedUserId)
    : null;

  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      selectedUserId: e.target.value,
      selectedDuty: '',
    }));
    setViolations(null);
    setError(null);
  };

  const handleDutyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      selectedDuty: e.target.value,
    }));
    setViolations(null);
    setError(null);
  };

  const handleValidate = async () => {
    if (!formData.selectedUserId || !formData.selectedDuty) {
      setError('Please select both a user and duty');
      return;
    }

    setIsValidating(true);
    try {
      const existingDuties =
        userAssignments?.data?.map((a) => a.dutyName) || [];
      const result = await checkViolations(
        projectId,
        formData.selectedUserId,
        formData.selectedDuty,
        existingDuties,
        securityStandard
      );

      if (!result.isValid && result.violations.length > 0) {
        setViolations(result.violations);
      } else {
        setViolations(null);
        // Ready to submit without override
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      setError(message);
      if (onError) onError(message);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.selectedUserId || !formData.selectedDuty) {
      setError('Please select both a user and duty');
      return;
    }

    if (violations && violations.length > 0 && !formData.overrideReason) {
      setError('Override reason required for compliance violations');
      return;
    }

    try {
      setError(null);
      await assignDuty.mutateAsync({
        userId: formData.selectedUserId,
        dutyName: formData.selectedDuty,
        overrideReason: formData.overrideReason,
      });

      setFormData({ selectedUserId: '', selectedDuty: '' });
      setViolations(null);

      if (onSuccess) onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assignment failed';
      setError(message);
      if (onError) onError(message);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-lg font-semibold">Assign Duty</h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Team Member Selection */}
        <div>
          <label htmlFor="user-select" className="block text-sm font-medium">
            Team Member
          </label>
          <select
            id="user-select"
            value={formData.selectedUserId}
            onChange={handleUserChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select a team member...</option>
            {teamMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.userName} ({member.email})
              </option>
            ))}
          </select>
        </div>

        {/* Current Duties Display */}
        {userAssignments?.data && userAssignments.data.length > 0 && (
          <div className="rounded-md bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-900">Current Duties:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {userAssignments.data.map((assignment) => (
                <span
                  key={assignment.dutyAssignmentId}
                  className="inline-block rounded-full bg-blue-200 px-3 py-1 text-sm text-blue-800"
                >
                  {assignment.dutyName}
                  {assignment.complianceOverride && (
                    <span className="ml-1 font-semibold">*</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Duty Selection */}
        <div>
          <label htmlFor="duty-select" className="block text-sm font-medium">
            Duty to Assign
          </label>
          <select
            id="duty-select"
            value={formData.selectedDuty}
            onChange={handleDutyChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select a duty...</option>
            {availableDuties?.data?.map((duty) => (
              <option
                key={duty.dutyName}
                value={duty.dutyName}
                disabled={!duty.isAvailable}
              >
                {duty.dutyName} ({duty.assignedMemberCount} assigned)
                {!duty.isAvailable && ' - Unavailable'}
              </option>
            ))}
          </select>
        </div>

        {/* Validation Button */}
        <button
          type="button"
          onClick={handleValidate}
          disabled={
            !formData.selectedUserId ||
            !formData.selectedDuty ||
            isValidating ||
            availableDuties.isLoading
          }
          className="w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
          {isValidating ? 'Validating...' : 'Check Compliance'}
        </button>

        {/* Compliance Warning */}
        {violations && violations.length > 0 && (
          <ComplianceWarning
            violations={violations}
            overrideReason={formData.overrideReason || ''}
            onReasonChange={(reason) =>
              setFormData((prev) => ({ ...prev, overrideReason: reason }))
            }
          />
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={assignDuty.isPending || availableDuties.isLoading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {assignDuty.isPending ? 'Assigning...' : 'Assign Duty'}
        </button>
      </form>
    </div>
  );
};
