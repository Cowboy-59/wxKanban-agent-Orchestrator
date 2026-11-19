/**
 * Component: TaskRoutingPrompt
 *
 * Prompts user to select team member for task routing.
 * Features:
 * - Display next duty in workflow
 * - Select from available team members
 * - Auto-assignment confirmation
 * - ALL duty special handling
 * - Task completion notification
 *
 * Implements T064
 */

import React, { useState } from 'react';
import { ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';
import { useTaskRouting } from '../../hooks/useTaskRouting';

interface TeamMemberOption {
  userId: string;
  userName: string;
  dutyName: string;
}

interface TaskRoutingPromptProps {
  taskId: string;
  projectId: string;
  currentDuty: string;
  onSuccess?: (status: string) => void;
  onError?: (error: string) => void;
}

type RoutingStatus =
  | 'idle'
  | 'routing'
  | 'selecting'
  | 'all-duty'
  | 'complete'
  | 'error';

export const TaskRoutingPrompt: React.FC<TaskRoutingPromptProps> = ({
  taskId,
  projectId,
  currentDuty,
  onSuccess,
  onError,
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [status, setStatus] = useState<RoutingStatus>('idle');
  const [nextDuty, setNextDuty] = useState<string>('');
  const [availableMembers, setAvailableMembers] = useState<TeamMemberOption[]>([]);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { routeToNextDuty } = useTaskRouting(taskId, projectId);

  const handleRouteTask = async () => {
    setStatus('routing');
    setError(null);

    try {
      const result = await routeToNextDuty.mutateAsync({
        taskId,
        manualAssigneeId: selectedMemberId || undefined,
      });

      setMessage(result.message);
      setNextDuty(result.nextDuty || '');

      if (result.status === 'autoAssigned') {
        setStatus('idle');
        if (onSuccess) onSuccess('autoAssigned');
      } else if (result.status === 'requiresManualSelection') {
        setStatus('selecting');
        setAvailableMembers(result.availableTeamMembers || []);
      } else if (result.status === 'assignAllTeamMembers') {
        setStatus('all-duty');
        if (onSuccess) onSuccess('all-duty');
      } else if (result.status === 'complete') {
        setStatus('complete');
        if (onSuccess) onSuccess('complete');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Routing failed';
      setError(errorMsg);
      setStatus('error');
      if (onError) onError(errorMsg);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold">Route Task to Next Duty</h3>

      {/* Current Status */}
      <div className="mb-4 rounded-md bg-blue-50 p-3">
        <p className="text-sm text-gray-700">
          <span className="font-medium">Current Duty:</span> {currentDuty}
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {status === 'idle' && (
        <>
          {/* Initial State - Route Button */}
          <button
            onClick={handleRouteTask}
            disabled={routeToNextDuty.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {routeToNextDuty.isPending ? 'Processing...' : 'Route to Next Duty'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {status === 'selecting' && availableMembers.length > 0 && (
        <>
          {/* Manual Selection Required */}
          <div className="mb-4 space-y-3">
            <p className="text-sm font-medium text-gray-900">
              Multiple team members available for{' '}
              <span className="font-semibold">{nextDuty}</span>. Select one:
            </p>

            <div className="space-y-2">
              {availableMembers.map((member) => (
                <label
                  key={member.userId}
                  className="flex items-center rounded-md border border-gray-200 p-3 hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="assignee"
                    value={member.userId}
                    checked={selectedMemberId === member.userId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    className="h-4 w-4 border-gray-300 text-blue-600"
                  />
                  <span className="ml-3 flex-1 text-sm">
                    <span className="font-medium text-gray-900">
                      {member.userName}
                    </span>
                    <span className="ml-2 text-gray-600">
                      ({member.dutyName})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleRouteTask}
            disabled={!selectedMemberId || routeToNextDuty.isPending}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {routeToNextDuty.isPending ? 'Assigning...' : 'Assign to Selected Member'}
          </button>
        </>
      )}

      {status === 'all-duty' && (
        <div className="rounded-md bg-purple-50 p-4 text-center">
          <p className="text-sm font-medium text-purple-900">
            ✓ Task assigned to all team members
          </p>
          <p className="mt-1 text-xs text-purple-700">{message}</p>
        </div>
      )}

      {status === 'complete' && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Task Completed</p>
              <p className="mt-1 text-sm text-green-700">{message}</p>
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <button
          onClick={() => {
            setStatus('idle');
            setError(null);
            setSelectedMemberId('');
          }}
          className="w-full rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300"
        >
          Try Again
        </button>
      )}
    </div>
  );
};
