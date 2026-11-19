import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ProjectCard,
  PhaseWithAssignee,
  PhaseCompletion,
  ProjectDocument,
  ProjectTask,
  ProjectSpec,
  ScaffoldResponse,
  ProjectPanelData,
} from "~/shared/types/projects";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleAuthError(response: Response): void {
  // If we get a 401 Unauthorized, clear the token and redirect to login
  if (response.status === 401) {
    localStorage.removeItem("wxkanban_token");
    window.location.href = "/login";
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    ...options,
  });
  
  if (!res.ok) {
    handleAuthError(res);
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (id: string) => [...projectKeys.all, id] as const,
  phases: (id: string) => [...projectKeys.detail(id), "phases"] as const,
  phase: (projectId: string, phaseId: string) =>
    [...projectKeys.phases(projectId), phaseId] as const,
  phaseCompletion: (projectId: string, phaseId: string) =>
    [...projectKeys.phase(projectId, phaseId), "completion"] as const,
  phaseTasks: (projectId: string, phaseId: string) =>
    [...projectKeys.phase(projectId, phaseId), "tasks"] as const,
  phaseSpecs: (projectId: string, phaseId: string) =>
    [...projectKeys.phase(projectId, phaseId), "specs"] as const,
  documents: (projectId: string) =>
    [...projectKeys.detail(projectId), "documents"] as const,
  scaffold: (projectId: string) =>
    [...projectKeys.detail(projectId), "scaffold"] as const,
  panel: (projectId: string) =>
    [...projectKeys.detail(projectId), "panel"] as const,
};

export function useProjects(showAll = false) {

  return useQuery({
    // Prefix-based invalidation: mutations invalidating projectKeys.list() refresh
    // both the "mine" and "all" variants.
    queryKey: [...projectKeys.list(), showAll ? "all" : "mine"],
    queryFn: () =>
      apiFetch<{ projects: ProjectCard[] }>(
        showAll ? "/api/projects?all=true" : "/api/projects"
      ).then((d) => d.projects),
    staleTime: 30_000,
  });
}

// ── Project detail ────────────────────────────────────────────────────────────

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  currentphase: string;
  hourlyrate: string | null;
  allocatedhours: string | null;
  pmsystems: string | null;
  securityclassification: string | null;
  companyid: string;
  createdat: string;
  updatedat: string;
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ""),
    queryFn: () =>
      apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}`).then(
        (d) => d.project
      ),
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ── Phases ────────────────────────────────────────────────────────────────────

export function usePhases(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.phases(projectId ?? ""),
    queryFn: () =>
      apiFetch<{ phases: PhaseWithAssignee[] }>(
        `/api/projects/${projectId}/phases`
      ).then((d) => d.phases),
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

// ── Phase completion ──────────────────────────────────────────────────────────

export function usePhaseCompletion(
  projectId: string | undefined,
  phaseId: string | undefined
) {
  return useQuery({
    queryKey: projectKeys.phaseCompletion(projectId ?? "", phaseId ?? ""),
    queryFn: () =>
      apiFetch<{ completion: PhaseCompletion }>(
        `/api/projects/${projectId}/phases/${phaseId}/completion`
      ).then((d) => d.completion),
    enabled: !!projectId && !!phaseId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ── Phase tasks ───────────────────────────────────────────────────────────────

export function usePhaseTasks(
  projectId: string | undefined,
  phaseId: string | undefined
) {
  return useQuery({
    queryKey: projectKeys.phaseTasks(projectId ?? "", phaseId ?? ""),
    queryFn: () =>
      apiFetch<{ tasks: ProjectTask[] }>(
        `/api/projects/${projectId}/phases/${phaseId}/tasks`
      ).then((d) => d.tasks),
    enabled: !!projectId && !!phaseId,
    staleTime: 15_000,
  });
}

export function useUpdateTaskStatus(projectId: string, phaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      apiFetch(`/api/projects/${projectId}/phases/${phaseId}/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.phaseTasks(projectId, phaseId) });
      qc.invalidateQueries({ queryKey: projectKeys.phaseCompletion(projectId, phaseId) });
    },
  });
}

export function useCreateTask(projectId: string, phaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      apiFetch(`/api/projects/${projectId}/phases/${phaseId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ name, description }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.phaseTasks(projectId, phaseId) });
      qc.invalidateQueries({ queryKey: projectKeys.phaseCompletion(projectId, phaseId) });
    },
  });
}

// ── Phase specs ───────────────────────────────────────────────────────────────

export function usePhaseSpecs(
  projectId: string | undefined,
  phaseId: string | undefined
) {
  return useQuery({
    queryKey: projectKeys.phaseSpecs(projectId ?? "", phaseId ?? ""),
    queryFn: () =>
      apiFetch<{ specs: ProjectSpec[] }>(
        `/api/projects/${projectId}/phases/${phaseId}/specs`
      ).then((d) => d.specs),
    enabled: !!projectId && !!phaseId,
    staleTime: 15_000,
  });
}

export function useCreateSpec(projectId: string, phaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, content }: { title: string; content?: string }) =>
      apiFetch(`/api/projects/${projectId}/phases/${phaseId}/specs`, {
        method: "POST",
        body: JSON.stringify({ title, content: content ?? "" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.phaseSpecs(projectId, phaseId) });
      qc.invalidateQueries({ queryKey: projectKeys.phaseCompletion(projectId, phaseId) });
    },
  });
}

export function useUpdateSpec(projectId: string, phaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      specId,
      updates,
    }: {
      specId: string;
      updates: { status?: "draft" | "review" | "approved"; title?: string; content?: string };
    }) =>
      apiFetch(`/api/projects/${projectId}/phases/${phaseId}/specs/${specId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.phaseSpecs(projectId, phaseId) });
      qc.invalidateQueries({ queryKey: projectKeys.phaseCompletion(projectId, phaseId) });
    },
  });
}

// ── Project documents ─────────────────────────────────────────────────────────

export function useProjectDocuments(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.documents(projectId ?? ""),
    queryFn: () =>
      apiFetch<{ documents: ProjectDocument[] }>(
        `/api/projects/${projectId}/documents`
      ).then((d) => d.documents),
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: (query) => {
      // Poll every 5s while overview content is empty (AI scaffolding pending)
      const docs = query.state.data;
      if (!docs) return false;
      const overview = docs.find((d) => d.doctype === "overview");
      return overview && overview.content === "" ? 5_000 : false;
    },
  });
}

export function useUpdateDocument(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, updates }: { docId: string; updates: { title?: string; content?: string } }) =>
      apiFetch(`/api/projects/${projectId}/documents/${docId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.documents(projectId) });
    },
  });
}

// ── Scaffold (for project.init command) ───────────────────────────────────────

export function useProjectScaffold(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.scaffold(projectId ?? ""),
    queryFn: () =>
      apiFetch<ScaffoldResponse>(`/api/projects/${projectId}/scaffold`),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

// ── Project panel (phase-aware summary for list row) ──────────────────────────

export function useProjectPanel(projectId: string) {
  return useQuery({
    queryKey: projectKeys.panel(projectId),
    queryFn: () => apiFetch<ProjectPanelData>(`/api/projects/${projectId}/panel`),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

// ── Phase lifecycle mutations ─────────────────────────────────────────────────

export function useAdvancePhase(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phaseId, reason }: { phaseId: string; reason?: string }) =>
      apiFetch(`/api/projects/${projectId}/phases/${phaseId}/advance`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.phases(projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useReopenPhase(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phaseId, reason }: { phaseId: string; reason: string }) =>
      apiFetch(`/api/projects/${projectId}/phases/${phaseId}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.phases(projectId) });
    },
  });
}

export function useAssignPhaseUser(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      phaseId,
      assigneduserid,
    }: {
      phaseId: string;
      assigneduserid: string | null;
    }) =>
      apiFetch(`/api/projects/${projectId}/phases/${phaseId}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ assigneduserid }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.phases(projectId) });
    },
  });
}

// ── Create project ────────────────────────────────────────────────────────────

interface CreateProjectInput {
  name: string;
  description?: string | null;
  hourlyrate?: string | null;
  allocatedhours?: string | null;
  pmsystems?: string | null;
  securityclassification?: string | null;
  phaseassignments?: Record<string, string | null>;
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiFetch<{ project: { id: string; name: string }; scaffolding: string }>(
        "/api/projects",
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() });
    },
  });
}
