export type ProjectContextSource = 'args' | 'env' | 'file' | 'none';

export interface LoadedProjectSummary {
  id: string;
  name: string;
  status: string | null;
  currentPhase: string | null;
  companyId: string | null;
  updatedAt: string | null;
}

interface MCPHealthState {
  startupTime: string;
  dbConnected: boolean;
  resolvedProjectId: string | null;
  resolutionSource: ProjectContextSource;
  projectFilePath: string | null;
  loadedProject: LoadedProjectSummary | null;
  lastUpdated: string;
}

const state: MCPHealthState = {
  startupTime: new Date().toISOString(),
  dbConnected: false,
  resolvedProjectId: null,
  resolutionSource: 'none',
  projectFilePath: null,
  loadedProject: null,
  lastUpdated: new Date().toISOString(),
};

function touch() {
  state.lastUpdated = new Date().toISOString();
}

export function setMcpDbConnected(connected: boolean): void {
  state.dbConnected = connected;
  touch();
}

export function setMcpProjectContext(params: {
  projectId: string | null;
  source: ProjectContextSource;
  projectFilePath?: string | null;
}): void {
  state.resolvedProjectId = params.projectId;
  state.resolutionSource = params.source;
  state.projectFilePath = params.projectFilePath ?? null;
  touch();
}

export function setMcpLoadedProject(project: LoadedProjectSummary | null): void {
  state.loadedProject = project;
  touch();
}

export function getMcpHealthState() {
  return {
    status: state.dbConnected ? 'healthy' : 'degraded',
    startupTime: state.startupTime,
    dbConnected: state.dbConnected,
    projectContext: {
      projectId: state.resolvedProjectId,
      source: state.resolutionSource,
      projectFilePath: state.projectFilePath,
    },
    project: state.loadedProject,
    lastUpdated: state.lastUpdated,
  };
}
