/**
 * Hook: useTaskRouting
 *
 * Manages task workflow routing through duty sequence.
 * Handles:
 * - POST /api/tasks/{taskId}/route-next-duty
 * - POST /api/tasks/{taskId}/reassign-duty
 *
 * Implements T067
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface TeamMemberOption {
  userId: string;
  userName: string;
  dutyName: string;
}

interface TaskRoutingResult {
  taskId: string;
  status:
    | 'autoAssigned'
    | 'requiresManualSelection'
    | 'assignAllTeamMembers'
    | 'complete';
  nextDuty?: string;
  assignedToUserId?: string;
  availableTeamMembers?: TeamMemberOption[];
  assignedCount?: number;
  message: string;
  completedAt?: string;
}

interface RouteTaskRequest {
  manualAssigneeId?: string;
}

interface ReassignTaskRequest {
  newDutyName: string;
  assignToUserId: string;
  reason: string;
}

interface ReassignTaskResponse {
  taskId: string;
  newDuty: string;
  newAssigneeId: string;
  newAssigneeName: string;
  reason: string;
  reassignedAt: string;
  reassignedBy: string;
  message: string;
}

/**
 * Hook to manage task routing through duty workflow
 * @param taskId - The task ID (optional, can be set per mutation)
 * @param projectId - The project ID
 */
export function useTaskRouting(taskId?: string, projectId?: string) {
  const queryClient = useQueryClient();

  // Route task to next duty in sequence
  const routeToNextDuty = useMutation({
    mutationFn: async (
      params: {
        taskId?: string;
        manualAssigneeId?: string;
      } = {}
    ): Promise<TaskRoutingResult> => {
      const id = params.taskId || taskId;
      if (!id) {
        throw new Error('Task ID required');
      }

      const request: RouteTaskRequest = {};
      if (params.manualAssigneeId) {
        request.manualAssigneeId = params.manualAssigneeId;
      }

      const url = new URL(`/api/tasks/${id}/route-next-duty`, window.location.origin);
      if (projectId) {
        url.searchParams.set('projectId', projectId);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to route task');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate task-related queries
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: ['tasks', projectId],
        });
      }
    },
  });

  // Reassign task to different duty and user
  const reassignDuty = useMutation({
    mutationFn: async (
      params: {
        taskId?: string;
        newDutyName: string;
        assignToUserId: string;
        reason: string;
      }
    ): Promise<ReassignTaskResponse> => {
      const id = params.taskId || taskId;
      if (!id) {
        throw new Error('Task ID required');
      }

      const request: ReassignTaskRequest = {
        newDutyName: params.newDutyName,
        assignToUserId: params.assignToUserId,
        reason: params.reason,
      };

      const url = new URL(`/api/tasks/${id}/reassign-duty`, window.location.origin);
      if (projectId) {
        url.searchParams.set('projectId', projectId);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reassign task');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate task-related queries
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: ['tasks', projectId],
        });
      }
    },
  });

  return {
    routeToNextDuty,
    reassignDuty,
  };
}
