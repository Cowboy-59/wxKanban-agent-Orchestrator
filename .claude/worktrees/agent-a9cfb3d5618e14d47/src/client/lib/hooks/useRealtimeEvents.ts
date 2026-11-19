import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "./useProjects";

interface WxkEvent {
  type:
    | "task_status_changed"
    | "spec_lifecycle_changed"
    | "task_created"
    | "task_deleted"
    | "phase_status_changed"
    | "spec_created"
    | "note_added"
    | "notification_created"
    | "time_entry_created";
  id: string;
  projectid: string;
  status?: string;
  prev_status?: string;
  updatedat: string;
}

/**
 * Subscribes to real-time task/spec status events for a project via SSE.
 * On any status change, invalidates the relevant TanStack Query cache entries
 * so the UI refetches without a manual refresh.
 *
 * Usage: call once in the project workspace component.
 *   useRealtimeEvents(projectId);
 */
export function useRealtimeEvents(projectid: string | undefined): void {
  const queryClient = useQueryClient();
  // Keep a stable ref to avoid re-subscribing when queryClient identity changes
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  useEffect(() => {
    if (!projectid) return;

    const source = new EventSource(`/api/events/${projectid}`, {
      withCredentials: true,
    });

    source.onmessage = (e: MessageEvent<string>) => {
      let event: WxkEvent;
      try {
        event = JSON.parse(e.data) as WxkEvent;
      } catch {
        return;
      }
      const { projectid, type } = event;
      const qc = qcRef.current;

      // Invalidate project detail and panel (always)
      qc.invalidateQueries({ queryKey: projectKeys.detail(projectid) });
      qc.invalidateQueries({ queryKey: projectKeys.panel(projectid) });
      qc.invalidateQueries({ queryKey: projectKeys.phases(projectid) });

      // Event-specific invalidations for granular updates
      switch (type) {
        case "task_created":
        case "task_status_changed":
        case "task_deleted":
          // Invalidate all phase tasks across all phases
          qc.invalidateQueries({ 
            queryKey: [...projectKeys.all, projectid, "phases"],
            exact: false 
          });
          break;

        case "spec_created":
        case "spec_lifecycle_changed":
          // Invalidate all phase specs across all phases
          qc.invalidateQueries({ 
            queryKey: [...projectKeys.all, projectid, "phases"],
            exact: false 
          });
          // Dispatch custom event for Kanban board to refresh
          window.dispatchEvent(
            new CustomEvent("spec-lifecycle-changed", {
              detail: { projectid, specid: event.id, status: event.status },
            })
          );
          break;


        case "phase_status_changed":
          // Invalidate specific phase and completion data
          qc.invalidateQueries({ 
            queryKey: [...projectKeys.all, projectid, "phases"],
            exact: false 
          });
          break;

        case "note_added":
        case "notification_created":
        case "time_entry_created":
          // Panel data may include counts of these items
          qc.invalidateQueries({ queryKey: projectKeys.panel(projectid) });
          break;
      }
    };
    source.onerror = () => {
      // EventSource auto-reconnects after error — no action needed here
    };

    return () => {
      source.close();
    };
  }, [projectid]);
}
