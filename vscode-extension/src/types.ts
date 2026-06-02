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

// [SCOPE 043 / T010] BEGIN — list_my_feedback wire shape
export interface MyFeedbackItem {
  id: string;
  referenceId: string;
  type: string;
  title: string;
  // [SCOPE 043 / T011] body the submitter entered + auto-captured context (for the read-only detail view)
  details: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  status: string;
  severity: string | null;
  classification: string | null;
  duplicateOfId: string | null;
  clarificationQuestion: string | null;
  clarificationAnswer: string | null;
  declineReason: string | null;
  artifactStatus: string;
  notificationChannel: string;
  createdAt: string;
  firstTriagedAt: string | null;
}
// [SCOPE 043 / T010] END
