export type GatewayOutputMode = "structured" | "human";
export type GatewayProviderName = "primary" | "fallback" | "deterministic";
export type GatewayDecisionStatus = "allowed" | "blocked";
export type GatewaySeverity = "critical" | "high" | "medium" | "low";
export type DriftResolvedStatus = "open" | "resolved" | "suppressed";
export type UpdateDecisionState = "pending" | "accepted" | "deferred" | "rejected";
export type ParityGateMode = "advisory" | "mandatory";

export interface GatewayContext {
  requestid: string;
  userid: string;
  companyid?: string;
  projectid?: string;
  outputmode: GatewayOutputMode;
  source: "api" | "cli" | "ide" | "agent";
}

export interface GatewayIntentRequest {
  intent: string;
  outputMode?: GatewayOutputMode;
  context?: {
    projectId?: string;
  };
}

export interface LLMToolCandidate {
  toolname: string;
  args: Record<string, unknown>;
  confidence: number;
  reasoning?: string;
}

export interface PolicyDecision {
  status: GatewayDecisionStatus;
  reason?: string;
  matchedpattern?: string;
  allowedtools?: string[];
}

export interface MCPToolCall {
  toolname: string;
  args: Record<string, unknown>;
}

export interface GatewayExecutionMetadata {
  requestid: string;
  provider: GatewayProviderName;
  toolname: string;
  executedat: string;
  outputmode: GatewayOutputMode;
}

export interface GatewaySuccessResult {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  outputMode: GatewayOutputMode;
  executedAt: string;
}

export interface GatewayBlockedResult {
  requestId: string;
  blocked: true;
  reason: string;
  executedAt: string;
}

export interface DriftEventFilters {
  projectid?: string;
  severity?: GatewaySeverity[];
  status?: DriftResolvedStatus;
  limit?: number;
  offset?: number;
}

export interface DriftEventInput {
  projectid: string;
  projectidentifier: string;
  mcpversionmain: string;
  mcpversionkit: string;
  changedpaths: string[];
  severity: GatewaySeverity;
}

export interface DriftEventRecord {
  id: string;
  projectId: string;
  projectIdentifier: string;
  mcpVersionMain: string;
  mcpVersionKit: string;
  changedPaths: string[];
  severity: GatewaySeverity;
  githubFeedbackRef: string | null;
  resolvedStatus: DriftResolvedStatus;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DriftSummary {
  total: number;
  open: number;
  bySeverity: Record<GatewaySeverity, number>;
  byProject: Array<{ projectIdentifier: string; open: number }>;
  oldestUnresolvedDays: number;
}

export interface MaintenanceWindow {
  start: string;
  end: string;
  tz: string;
}

export interface AvailableUpdateResponse {
  version: string | null;
  currentVersion: string;
  upToDate?: boolean;
  commandChanges?: string[];
  behaviorImpacts?: string[];
  recommendation?: string;
  publishedAt?: string;
}

export interface ChangelogDetail {
  version: string;
  added: string[];
  changed: string[];
  fixed: string[];
  breaking: string[];
  publishedAt: string;
}

export interface UpdateDecisionInput {
  projectId: string;
  version: string;
  decision: Exclude<UpdateDecisionState, "pending">;
  maintenanceWindow?: MaintenanceWindow;
}

export interface UpdateDecisionResult {
  id: string;
  projectId: string;
  version: string;
  decisionState: Exclude<UpdateDecisionState, "pending">;
  decidedAt: string;
  nextReminderAt: string | null;
}

export interface ParityConfigResponse {
  id: string;
  gateMode: ParityGateMode;
  advisoryStartedAt: string | null;
  mandatoryActivatedAt: string | null;
  rollbackAt: string | null;
  rollbackBy: string | null;
  createdAt: string;
  updatedAt: string;
}
