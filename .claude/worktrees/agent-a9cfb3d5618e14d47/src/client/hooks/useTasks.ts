import { useCallback, useEffect, useRef, useState } from "react";

export interface AggregatedTask {
  id: string;
  projectid: string;
  projectname: string | null;
  name: string;
  description: string | null;
  status: "open" | "in_progress" | "completed" | "orphaned";
  priority: "low" | "medium" | "high" | "critical";
  duedate: string | null;
  sourcepmssystem: "jira" | "monday" | "asana" | "trello" | null;
  externalid: string | null;
  sourceoforigin: "external" | "internal" | "ai_proposed";
  assignedtoid: string | null;
  assignedtoname: string | null;
  createdat: string;
  updatedat: string;
}

export interface TaskFilters {
  source?: "jira" | "monday" | "asana" | "trello" | "internal";
  priority?: "low" | "medium" | "high" | "critical";
  status?: "open" | "in_progress" | "completed" | "orphaned";
  sort?: "duedate" | "priority" | "name" | "updatedat";
  order?: "asc" | "desc";
}

interface UseTasksState {
  tasks: AggregatedTask[];
  count: number;
  isLoading: boolean;
  error: string | null;
}

function buildQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== "") params.append(k, String(v));
  }
  return params.toString();
}

export function useTasks(filters: TaskFilters) {
  const [state, setState] = useState<UseTasksState>({
    tasks: [],
    count: 0,
    isLoading: true,
    error: null,
  });
  // Keep the latest filters in a ref so we can refetch without recreating
  // the callback (and breaking optimization in consumers).
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const qs = buildQuery(filtersRef.current);
      const response = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setState({
        tasks: data.data ?? [],
        count: data.count ?? 0,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState({
        tasks: [],
        count: 0,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load tasks",
      });
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [
    filters.source,
    filters.priority,
    filters.status,
    filters.sort,
    filters.order,
    refetch,
  ]);

  return { ...state, refetch };
}

export interface SyncResult {
  pmsystem: string;
  added: number;
  updated: number;
  unchanged: number;
  errors: string[];
}

export async function triggerSync(): Promise<SyncResult[]> {
  const response = await fetch("/api/tasks/sync", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || "Sync failed");
  }
  const data = await response.json();
  return data.data ?? [];
}

export interface ConnectionSyncStatus {
  pmsystem: string;
  syncstatus: string;
  lastsyncsat: string | null;
}

export async function fetchSyncStatus(): Promise<ConnectionSyncStatus[]> {
  const response = await fetch("/api/tasks/sync-status", {
    credentials: "include",
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.data ?? [];
}
