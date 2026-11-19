/**
 * Hook: useComplianceAudit
 *
 * Fetches compliance override history with filtering and pagination.
 * Handles: GET /api/compliance/overrides
 *
 * Implements T068
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';

interface ComplianceOverrideDetail {
  complianceOverrideId: string;
  projectId: string;
  userId: string;
  userName: string;
  dutyName: string;
  violatedRules: Array<{
    ruleId: string;
    reason: string;
    standard: 'SOC2' | 'HITRUST';
  }>;
  reason: string;
  overriddenBy: string;
  overriddenByName: string;
  standard: 'SOC2' | 'HITRUST';
  createdAt: string;
}

interface ComplianceOverrideSummary {
  complianceOverrideId: string;
  projectId: string;
  userId: string;
  userName: string;
  dutyName: string;
  violatedRules: string[];
  reason: string;
  overriddenBy: string;
  overriddenByName: string;
  standard: 'SOC2' | 'HITRUST';
  createdAt: string;
}

interface ComplianceOverridesResponse {
  total: number;
  limit: number;
  offset: number;
  items: ComplianceOverrideSummary[];
}

interface ComplianceAuditFilters {
  projectId?: string;
  userId?: string;
  overriddenBy?: string;
  standard?: 'SOC2' | 'HITRUST';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Hook to fetch compliance override history with filtering
 * @param filters - Optional filters for the query
 */
export function useComplianceAudit(
  filters?: ComplianceAuditFilters
): UseQueryResult<ComplianceOverridesResponse> {
  return useQuery({
    queryKey: ['compliance-overrides', filters],
    queryFn: async () => {
      const url = new URL('/api/compliance/overrides', window.location.origin);

      if (filters?.projectId) {
        url.searchParams.set('projectId', filters.projectId);
      }
      if (filters?.userId) {
        url.searchParams.set('userId', filters.userId);
      }
      if (filters?.overriddenBy) {
        url.searchParams.set('overriddenBy', filters.overriddenBy);
      }
      if (filters?.standard) {
        url.searchParams.set('standard', filters.standard);
      }
      if (filters?.startDate) {
        url.searchParams.set('startDate', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        url.searchParams.set('endDate', filters.endDate.toISOString());
      }

      url.searchParams.set('limit', String(filters?.limit || 50));
      url.searchParams.set('offset', String(filters?.offset || 0));

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch compliance overrides');
      }

      return response.json();
    },
  });
}

/**
 * Hook to fetch a single compliance override detail
 * @param overrideId - The override ID
 */
export function useComplianceOverrideDetail(
  overrideId?: string
): UseQueryResult<ComplianceOverrideDetail> {
  return useQuery({
    queryKey: ['compliance-override', overrideId],
    queryFn: async () => {
      if (!overrideId) {
        throw new Error('Override ID required');
      }

      const response = await fetch(`/api/compliance/overrides/${overrideId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch override detail');
      }

      return response.json();
    },
    enabled: !!overrideId,
  });
}
