/**
 * Hook: useDutyAssignment
 *
 * Manages duty assignment operations with TanStack Query caching.
 * Handles:
 * - POST /api/projects/{projectId}/duties/assign
 * - GET /api/projects/{projectId}/duties/assignments
 * - DELETE /api/projects/{projectId}/duties/assignments/{assignmentId}
 *
 * Implements T065
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface DutyAssignment {
  dutyAssignmentId: string;
  userId: string;
  userName: string;
  dutyName: string;
  projectId: string;
  assignedAt: string;
  assignedBy?: string;
  complianceOverride?: {
    complianceOverrideId: string;
    violatedRules: string[];
    reason: string;
    overriddenBy: string;
  };
}

interface AssignDutyRequest {
  userId: string;
  dutyName: string;
  overrideReason?: string;
}

interface AssignDutyResponse {
  dutyAssignmentId: string;
  userId: string;
  dutyName: string;
  projectId: string;
  assignedAt: string;
  complianceOverride?: {
    complianceOverrideId: string;
    violatedRules: string[];
    reason: string;
  };
}

interface AvailableDuty {
  dutyName: string;
  sequence: number;
  isAvailable: boolean;
  assignedMemberCount: number;
  standard?: 'SOC2' | 'HITRUST';
}

/**
 * Hook to manage duty assignments for a project
 * @param projectId - The project ID
 */
export function useDutyAssignment(projectId: string) {
  const queryClient = useQueryClient();

  // Get all assignments for the project
  const assignments = useQuery<DutyAssignment[]>({
    queryKey: ['duty-assignments', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/duties/assignments`);
      if (!response.ok) {
        throw new Error('Failed to fetch assignments');
      }
      return response.json();
    },
    enabled: !!projectId,
  });

  // Get assignments filtered by user
  const assignmentsByUser = (userId: string) =>
    useQuery<DutyAssignment[]>({
      queryKey: ['duty-assignments', projectId, userId],
      queryFn: async () => {
        const response = await fetch(
          `/api/projects/${projectId}/duties/assignments?userId=${userId}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch user assignments');
        }
        return response.json();
      },
      enabled: !!projectId && !!userId,
    });

  // Get available duties
  const availableDuties = useQuery<AvailableDuty[]>({
    queryKey: ['available-duties', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/duties/available`);
      if (!response.ok) {
        throw new Error('Failed to fetch available duties');
      }
      return response.json();
    },
    enabled: !!projectId,
  });

  // Assign duty to user
  const assignDuty = useMutation({
    mutationFn: async (data: AssignDutyRequest): Promise<AssignDutyResponse> => {
      const response = await fetch(`/api/projects/${projectId}/duties/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to assign duty');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: ['duty-assignments', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['available-duties', projectId],
      });
    },
  });

  // Remove duty assignment
  const removeDutyAssignment = useMutation({
    mutationFn: async (assignmentId: string): Promise<void> => {
      const response = await fetch(
        `/api/projects/${projectId}/duties/assignments/${assignmentId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove assignment');
      }
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({
        queryKey: ['duty-assignments', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['available-duties', projectId],
      });
    },
  });

  return {
    assignments,
    assignmentsByUser,
    availableDuties,
    assignDuty,
    removeDutyAssignment,
  };
}
