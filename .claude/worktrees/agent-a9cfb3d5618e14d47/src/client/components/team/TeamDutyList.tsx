/**
 * Component: TeamDutyList
 *
 * Displays all team members and their assigned duties.
 * Features:
 * - Team member list with assigned duties
 * - Compliance override badge
 * - Remove duty button (Team Manager only)
 * - Real-time updates
 *
 * Implements T063
 */

import React, { useState } from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { useDutyAssignment } from '../../hooks/useDutyAssignment';

interface DutyAssignment {
  dutyAssignmentId: string;
  userId: string;
  userName: string;
  dutyName: string;
  assignedAt: string;
  assignedBy?: string;
  complianceOverride?: {
    complianceOverrideId: string;
    violatedRules: string[];
    reason: string;
    overriddenBy: string;
  };
}

interface TeamDutyListProps {
  projectId: string;
  isTeamManager: boolean;
  onRemoveSuccess?: () => void;
  onError?: (error: string) => void;
}

export const TeamDutyList: React.FC<TeamDutyListProps> = ({
  projectId,
  isTeamManager,
  onRemoveSuccess,
  onError,
}) => {
  const { assignments, removeDutyAssignment } = useDutyAssignment(projectId);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Group assignments by user
  const assignmentsByUser = React.useMemo(() => {
    if (!assignments.data) return {};

    return assignments.data.reduce(
      (acc, assignment) => {
        if (!acc[assignment.userId]) {
          acc[assignment.userId] = {
            userId: assignment.userId,
            userName: assignment.userName,
            duties: [],
          };
        }
        acc[assignment.userId].duties.push(assignment);
        return acc;
      },
      {} as Record<
        string,
        {
          userId: string;
          userName: string;
          duties: DutyAssignment[];
        }
      >
    );
  }, [assignments.data]);

  const handleRemoveDuty = async (assignmentId: string) => {
    try {
      await removeDutyAssignment.mutateAsync(assignmentId);
      setToastMessage('Duty assignment removed');
      if (onRemoveSuccess) onRemoveSuccess();

      // Clear toast after 3 seconds
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove';
      setToastMessage(`Error: ${message}`);
      if (onError) onError(message);
    }
  };

  if (assignments.isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-600">Loading assignments...</div>
      </div>
    );
  }

  if (!assignments.data || assignments.data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center">
        <p className="text-sm text-gray-600">No duty assignments yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast Message */}
      {toastMessage && (
        <div
          className={`rounded-md p-3 text-sm ${
            toastMessage.startsWith('Error')
              ? 'bg-red-50 text-red-700'
              : 'bg-green-50 text-green-700'
          }`}
        >
          {toastMessage}
        </div>
      )}

      {/* Assignments by User */}
      {Object.values(assignmentsByUser).map((userGroup) => (
        <div
          key={userGroup.userId}
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          {/* User Header */}
          <h3 className="font-semibold text-gray-900">{userGroup.userName}</h3>

          {/* Duties List */}
          <div className="mt-3 space-y-2">
            {userGroup.duties.map((assignment) => (
              <div
                key={assignment.dutyAssignmentId}
                className="flex items-start justify-between rounded-md bg-gray-50 p-2"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {assignment.dutyName}
                    </span>

                    {/* Compliance Override Badge */}
                    {assignment.complianceOverride && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                        <AlertCircle className="h-3 w-3" />
                        Override
                      </span>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="mt-1 text-xs text-gray-600">
                    <div>Assigned: {new Date(assignment.assignedAt).toLocaleDateString()}</div>
                    {assignment.assignedBy && (
                      <div>By: {assignment.assignedBy}</div>
                    )}
                    {assignment.complianceOverride && (
                      <div>Override by: {assignment.complianceOverride.overriddenBy}</div>
                    )}
                  </div>
                </div>

                {/* Remove Button */}
                {isTeamManager && (
                  <button
                    onClick={() => handleRemoveDuty(assignment.dutyAssignmentId)}
                    disabled={removeDutyAssignment.isPending}
                    className="ml-4 rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="Remove duty assignment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
