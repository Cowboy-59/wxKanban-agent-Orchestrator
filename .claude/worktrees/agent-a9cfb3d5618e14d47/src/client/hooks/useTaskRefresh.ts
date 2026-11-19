/**
 * useTaskRefresh Hook
 * 
 * Provides automatic task refresh functionality when window regains focus.
 * This ensures users see the latest task data after switching back to the app.
 */

import { useEffect, useCallback, useRef } from 'react';

interface UseTaskRefreshOptions {
  /** Callback function to refresh tasks */
  onRefresh: () => void | Promise<void>;
  /** Enable/disable auto-refresh on window focus (default: true) */
  enabled?: boolean;
  /** Debounce delay in ms to prevent rapid refreshes (default: 1000ms) */
  debounceMs?: number;
  /** Minimum time between refreshes in ms (default: 30000ms = 30s) */
  minIntervalMs?: number;
}

interface UseTaskRefreshReturn {
  /** Manually trigger a refresh */
  refresh: () => void;
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
  /** Timestamp of last successful refresh */
  lastRefreshAt: Date | null;
}

/**
 * Hook for auto-refreshing tasks when window regains focus
 * 
 * @example
 * ```tsx
 * const { refresh, isRefreshing, lastRefreshAt } = useTaskRefresh({
 *   onRefresh: async () => {
 *     await fetchTasks();
 *   },
 *   enabled: true,
 *   debounceMs: 1000,
 *   minIntervalMs: 30000,
 * });
 * ```
 */
export function useTaskRefresh(options: UseTaskRefreshOptions): UseTaskRefreshReturn {
  const {
    onRefresh,
    enabled = true,
    debounceMs = 1000,
    minIntervalMs = 30000,
  } = options;

  const isRefreshingRef = useRef(false);
  const lastRefreshAtRef = useRef<Date | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityChangeTimeRef = useRef<number>(0);

  // Trigger refresh with debouncing and rate limiting
  const refresh = useCallback(() => {
    // Check if already refreshing
    if (isRefreshingRef.current) {
      return;
    }

    // Check minimum interval
    const now = Date.now();
    if (lastRefreshAtRef.current) {
      const timeSinceLastRefresh = now - lastRefreshAtRef.current.getTime();
      if (timeSinceLastRefresh < minIntervalMs) {
        return;
      }
    }

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set debounce timer
    debounceTimerRef.current = setTimeout(async () => {
      isRefreshingRef.current = true;
      
      try {
        await onRefresh();
        lastRefreshAtRef.current = new Date();
      } catch (error) {
        console.error('Task refresh failed:', error);
      } finally {
        isRefreshingRef.current = false;
      }
    }, debounceMs);
  }, [onRefresh, debounceMs, minIntervalMs]);

  // Handle window focus event
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Record when visibility changed
        visibilityChangeTimeRef.current = Date.now();
        
        // Trigger refresh when window becomes visible
        refresh();
      }
    };

    // Listen for visibility change (modern browsers)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also listen for focus event as fallback
    const handleFocus = () => {
      // Only trigger if visibility change wasn't recent (prevents double refresh)
      const timeSinceVisibilityChange = Date.now() - visibilityChangeTimeRef.current;
      if (timeSinceVisibilityChange > 100) {
        refresh();
      }
    };

    window.addEventListener('focus', handleFocus);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, refresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    refresh,
    get isRefreshing() {
      return isRefreshingRef.current;
    },
    get lastRefreshAt() {
      return lastRefreshAtRef.current;
    },
  };
}

/**
 * Hook for manual task refresh with loading state
 * 
 * @example
 * ```tsx
 * const { refresh, isLoading, error } = useManualTaskRefresh(async () => {
 *   await fetchTasks();
 * });
 * ```
 */
export function useManualTaskRefresh(
  refreshFn: () => void | Promise<void>
): {
  refresh: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
} {
  const [state, setState] = React.useState<{
    isLoading: boolean;
    error: Error | null;
  }>({
    isLoading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState({ isLoading: true, error: null });
    
    try {
      await refreshFn();
      setState({ isLoading: false, error: null });
    } catch (error) {
      setState({
        isLoading: false,
        error: error instanceof Error ? error : new Error('Refresh failed'),
      });
    }
  }, [refreshFn]);

  return {
    refresh,
    isLoading: state.isLoading,
    error: state.error,
  };
}

// Import React for useManualTaskRefresh
import React from 'react';
