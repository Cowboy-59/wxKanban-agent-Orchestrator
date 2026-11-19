export type ProjectPhaseStatus = "pending" | "in_progress" | "complete" | "reopened";

export type ProjectStatus = "ACTIVE" | "ARCHIVE" | "BRANCHED";

export type ProjectPhaseSlug =
  | "design"
  | "implementation"
  | "qa"
  | "human-testing"
  | "beta"
  | "release";

export const PHASE_SLUGS: Record<string, ProjectPhaseSlug> = {
  Design: "design",
  Implementation: "implementation",
  QA: "qa",
  HumanTesting: "human-testing",
  Beta: "beta",
  Release: "release",
};

export const PHASE_NAMES: Record<ProjectPhaseSlug, string> = {
  design: "Design",
  implementation: "Implementation",
  qa: "QA",
  "human-testing": "HumanTesting",
  beta: "Beta",
  release: "Release",
};

export interface PhaseAssignedUser {
  id: string;
  fullname: string | null;
  emailaddr: string | null;
}

export interface PhaseWithAssignee {
  id: string;
  projectid: string;
  phasename: string;
  status: ProjectPhaseStatus;
  assigneduserid: string | null;
  assigneduser: PhaseAssignedUser | null;
  enteredat: string | null;
  completedat: string | null;
  reason: string | null;
  createdat: string;
}

export interface PhaseCompletionCriterion {
  label: string;
  passed: boolean;
  detail: string;
}

export interface PhaseCompletion {
  canAdvance: boolean;
  criteria: PhaseCompletionCriterion[];
  blockingtasks?: Array<{ id: string; name: string; status: string; scopetitle: string | null }>;
}

export interface ProjectDocument {
  id: string;
  projectid: string;
  specid: string | null;
  doctype: string;
  title: string;
  content: string;
  filepath: string | null;
  isgenerated: boolean;
  createdat: string;
  updatedat: string;
  createdbyid: string | null;
}

export interface ProjectCard {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  hourlyrate: string | null;
  allocatedhours: string | null;
  pmsystems: string | null;
  securityclassification: string | null;
  // [SCOPE 112 / T006] Replaces `audittype`. A project can be audited against several
  // frameworks at once; `audittype` was a single varchar and could not express that.
  activeframeworks: string[];
  currentphase: string;
  activephase: PhaseWithAssignee | null;
  opentaskcount: number;
  currentphasetotal: number;
  currentphasecompleted: number;
  createdat: string;
  updatedat: string;
  activePhases?: string[];
  // Spec 037 FR-029 — present when accessed via active Engagement, not direct ownership.
  accessRole?: "owner" | "consulting";
  engagementId?: string;
  clientCompanyName?: string;
}

export interface ScaffoldSpec {
  number: string;
  title: string;
  content: string;
}

export interface ScaffoldResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
    currentphase: string;
  };
  overview: {
    content: string;
  };
  specs: ScaffoldSpec[];
  phases: Array<{
    phasename: string;
    status: ProjectPhaseStatus;
    assigneduser: { fullname: string | null; emailaddr: string | null } | null;
  }>;
}


export interface ProjectTask {
  id: string;
  projectid: string;
  phaseid: string | null;
  name: string;
  description: string | null;
  issuetype: string | null;
  priority: string;
  status: string;
  results: string | null;
  effort: string | null;
  sourceoforigin: string;
  assignedtoid: string | null;
  assignedtoname: string | null;
  duedate: string | null;
  createdat: string;
  updatedat: string;
}


export type ScopeStatus =
  | "draft"
  | "in_review"
  | "pending_clarification"
  | "clarified"
  | "planned"
  | "tasks_generated"
  | "implementing"
  | "implemented"
  | "qa_passed"
  | "human_tested"
  | "beta_cleared"
  | "released"
  | "deferred"
  | "archived";

export interface ProjectSpec {
  id: string;
  projectid: string;
  specnumber: string;
  title: string;
  content: string;
  status: ScopeStatus;
  specorder: number;
  isoptional: boolean;
  createdbyid: string | null;
  createdat: string;
  approvedat: string | null;
  updatedat: string;
}

export interface ProjectScope extends ProjectSpec {
  createdbyname: string | null;
  // [SCOPE 058 / T031] Checkout claim — who is working this scope (null when free).
  claimedbyid: string | null;
  claimedbyname: string | null;
  claimedat: string | null;
  taskcount: number;
  completedtaskcount: number;
  opencount: number;
  inprogresscount: number;
  orphanedcount: number;
  documents?: PanelDocument[];
}

export interface ScopeConflict {
  conflicttype: string;
  withscope: string;
  description: string;
}

export interface ScopeMatrixCell {
  status: "pending" | "active" | "complete" | "blocked" | "deferred";
}

export interface ScopeMatrixRow {
  id: string;
  specnumber: string;
  title: string;
  status: ScopeStatus;
  isoptional: boolean;
  phases: Record<string, ScopeMatrixCell["status"]>;
}

export interface TaskDependencyRef {
  id: string;
  name: string;
  status: string;
}

export interface ProjectTaskDetail {
  id: string;
  projectid: string;
  phaseid: string | null;
  name: string;
  description: string | null;
  issuetype: string | null;
  priority: string;
  status: string;
  results: string | null;
  effort: string | null;
  sourceoforigin: string;
  assignedtoid: string | null;
  assignedtoname: string | null;
  duedate: string | null;
  specid: string | null;
  scopetitle: string | null;
  externalid: string | null;
  sourcepmssystem: string | null;
  blockedby: TaskDependencyRef[];
  blocking: TaskDependencyRef[];
  timeentriescount: number;
  notescount: number;
  isblocked: boolean;
  createdat: string;
  updatedat: string;
}


export interface TaskDependency {
  id: string;
  taskid: string;
  blockedbyid: string;
  createdat: string;
}

export interface ScopeChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdat: string;
}

export interface AppNotification {
  id: string;
  type: string;
  entityid: string | null;
  entitytype: string | null;
  message: string;
  read: boolean;
  createdat: string;
}

export interface PhaseValidationCriteria {
  label: string;
  passed: boolean;
  detail: string;
}

export interface PhaseValidationResult {
  canadvance: boolean;
  criteria: PhaseValidationCriteria[];
  blockingtasks: Array<{
    id: string;
    name: string;
    status: string;
    scopetitle: string | null;
  }>;
}

export interface TaskActivityEntry {
  id: string;
  actorid: string;
  actorname: string;
  type: string;
  description: string;
  createdat: string;
}

export interface AITaskProposal {
  name: string;
  description: string;
  issuetype: string;
  priority: string;
  phase: string;
  isDuplicate: boolean;
}

// ─── Project Panel (right-side detail panel in project list) ──────────────────

export interface PanelDocument {
  id: string;
  doctype: string;
  title: string;
  filepath: string | null;
  content: string;
}

export interface PanelTask {
  id: string;
  name: string;
  status: string;
  priority: string;
  issuetype: string | null;
}

export interface PanelScope {
  id: string;
  specnumber: string;
  title: string;
  status: ScopeStatus;
  taskcount: number;
  completedtaskcount: number;
  opencount: number;
  inprogresscount: number;
  documents: PanelDocument[];
}

export interface ProjectPanelData {
  phase: string;
  overview: PanelDocument | null;
  overviewexcerpt: string | null;
  scopes: PanelScope[];
}
