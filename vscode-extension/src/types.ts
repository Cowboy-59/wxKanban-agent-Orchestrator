// Wire contract for project.cockpit_summary (mcp-server/src/server.ts). Kept in
// sync with that tool's JSON output — they're coupled by the MCP response shape.

// [SCOPE 042 / T011] BEGIN — cockpit DTOs
export interface CockpitTask {
  id: string;
  title: string;
  status: string;
  descriptionMarkdown: string;
}

export interface CockpitScope {
  id: string;
  specNumber: string;
  title: string;
  status: string;
  remainingCount: number;
  tasks: CockpitTask[];
}

export interface CockpitSummary {
  projectId: string;
  scopes: CockpitScope[];
  unlinkedTasks: CockpitTask[];
}
// [SCOPE 042 / T011] END
