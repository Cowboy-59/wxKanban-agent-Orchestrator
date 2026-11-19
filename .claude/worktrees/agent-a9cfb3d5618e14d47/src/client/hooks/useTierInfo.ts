import { useState, useEffect, useCallback } from 'react';

interface TierInfo {
  tier: string;
  limits: {
    maxUsers: number;
    maxProjects: number;
    maxStorageGB: number;
    features: string[];
  };
  usage: {
    users: number;
    projects: number;
    storageGB: number;
  };
}

interface UseTierInfoReturn {
  tierInfo: TierInfo | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  canAddUser: boolean;
  isFeatureAvailable: (feature: string) => boolean;
}

export function useTierInfo(): UseTierInfoReturn {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTierInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/tier/info', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch tier info');
      }

      const data = await response.json();
      setTierInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTierInfo();
  }, [fetchTierInfo]);

  const canAddUser = tierInfo
    ? tierInfo.usage.users < tierInfo.limits.maxUsers
    : false;

  const isFeatureAvailable = useCallback(
    (feature: string): boolean => {
      if (!tierInfo) return false;
      return tierInfo.limits.features.includes(feature);
    },
    [tierInfo]
  );

  return {
    tierInfo,
    loading,
    error,
    refetch: fetchTierInfo,
    canAddUser,
    isFeatureAvailable,
  };
}
