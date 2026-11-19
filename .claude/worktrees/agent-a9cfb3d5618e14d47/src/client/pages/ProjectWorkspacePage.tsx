import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "~/client/i18n";
import {
  ArrowLeft,
  Archive,
  BookOpen,
  Loader2,
  AlertCircle,
  RefreshCw,
  LayoutGrid,
  Columns,
  Shield,
  Pencil,
  Trash2,
  X,
  Check,
  Package,
  Users,
  Code2,
  FlaskConical,
  UserCheck,
} from "lucide-react";




import {
  AuditConfigPanel,
  AuditTaskBrowser,
  AuditExecutionPanel,
  ComplianceReportViewer,
  DocumentUpload,
} from "~/client/components/audit/index.js";
import { KitManager } from "~/client/components/KitManagement";
import { ProjectAgentAccessPanel } from "~/client/components/Settings/ProjectAgentAccessPanel.js"; // [SCOPE 134 / T027]
import { ImpactModePanel } from "~/client/components/Settings/ImpactModePanel.js"; // [SCOPE 137 / T019]

import { AppShell } from "~/client/components/layout/AppShell";
import { TestSuitePanel } from "~/client/components/Tests/TestSuitePanel"; // [SCOPE 111]
import { UserTestPanel } from "~/client/components/Tests/UserTestPanel"; // [SCOPE 111]
import { DesignPhaseView } from "~/client/components/Projects/DesignPhaseView";
import { ImplementationPhaseView } from "~/client/components/Projects/ImplementationPhaseView";
import { QAPhaseView } from "~/client/components/Projects/QAPhaseView";
import { HumanTestingPhaseView } from "~/client/components/Projects/HumanTestingPhaseView";
import { BetaPhaseView } from "~/client/components/Projects/BetaPhaseView";
import { ReleasePhaseView } from "~/client/components/Projects/ReleasePhaseView";
import { ScopeMatrixView } from "~/client/components/Projects/ScopeMatrixView";
import { ScopeKanbanBoard } from "~/client/components/Projects/ScopeKanbanBoard";
import { ScopeChatView } from "~/client/components/Projects/ScopeChatView";
import StackTabView from "~/client/components/Projects/StackTabView"; // [SCOPE 055 / T008]
import ThemeTabView from "~/client/components/Projects/ThemeTabView"; // [SCOPE 062 / T011]
import BugReportsTabView from "~/client/components/Projects/BugReportsTabView"; // [SCOPE 063 / T010]
import PortfolioAnalyzerTab from "~/client/components/Projects/PortfolioAnalyzerTab"; // [SCOPE 075 / T8]
import { Palette } from "lucide-react"; // [SCOPE 062 / T011]
import { Bug } from "lucide-react"; // [SCOPE 063 / T010]
import { Network } from "lucide-react"; // [SCOPE 075 / T7]
import { ListChecks } from "lucide-react"; // [SCOPE 081 / T010]
import { TaskDrawer } from "~/client/components/Projects/TaskDrawer";
import { useAuth } from "~/client/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { projectKeys } from "~/client/lib/hooks/useProjects";
import { useRealtimeEvents } from "~/client/lib/hooks/useRealtimeEvents";
import type {
  PhaseWithAssignee,
  PhaseCompletion,
  ProjectDocument,
  ProjectTask,
  ProjectScope,
} from "~/shared/types/projects";

const SLUG_TO_PHASE: Record<string, string> = {
  design: "Design",
  implementation: "Implementation",
  qa: "QA",
  "human-testing": "HumanTesting",
  beta: "Beta",
  release: "Release",
};

// ── Inline ComplianceWorkspace ────────────────────────────────────────────────
type ComplianceTab = "settings" | "documents" | "tasks" | "audit" | "reports";

function ComplianceWorkspace({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ComplianceTab>("settings");
  const [refreshKey, setRefreshKey] = useState(0);
  const [enabledFrameworks, setEnabledFrameworks] = useState<string[]>([]);

  // SPEC-112 / FR-001 — read THIS project's frameworks. This previously hit the
  // company-wide row, so every project in a company showed the same list
  // regardless of what it was actually audited against.
  const loadEnabledFrameworks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/audit/config?projectId=${encodeURIComponent(projectId)}`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const json = await res.json();
      const c = json.data ?? {};
      const enabled: string[] = [];
      if (c.soc2enabled) enabled.push("SOC2");
      if (c.hipaaenabled) enabled.push("HIPAA");
      if (c.hitrustenabled) enabled.push("HITRUST");
      if (c.gdprenabled) enabled.push("GDPR");
      if (c.nistssdfenabled) enabled.push("NISTSSDF");
      if (c.iso27001enabled) enabled.push("ISO27001");
      setEnabledFrameworks(enabled);
    } catch {
      // Non-fatal — children fall back to "show all" when prop is empty/undefined
    }
  }, [projectId]);

  useEffect(() => {
    void loadEnabledFrameworks();
  }, [loadEnabledFrameworks, refreshKey]);

  // [SCOPE 146 / T006] MODIFIED-BY — Audit and Reports are the Platform Self-Audit (wxKanban auditing
  // its own code), SYSADMIN only on the server; they are not offered to anyone else (FR-007)
  const { user } = useAuth();
  const isSysAdmin = user?.usertype === "SYSADMIN";
  const complianceTabs: { id: ComplianceTab; label: string }[] = [
    { id: "settings", label: t("projectWorkspace.complianceTabSettings") },
    { id: "documents", label: t("projectWorkspace.complianceTabDocuments") },
    { id: "tasks", label: t("projectWorkspace.complianceTabTasks") },
    ...(isSysAdmin
      ? [
          { id: "audit" as const, label: t("projectWorkspace.complianceTabAudit") },
          { id: "reports" as const, label: t("projectWorkspace.complianceTabReports") },
        ]
      : []),
  ];

  const handleConfigChange = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {complianceTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeTab === "settings" && (
        <AuditConfigPanel key={refreshKey} projectId={projectId} onChange={handleConfigChange} />
      )}
      {activeTab === "documents" && (
        <DocumentUpload
          enabledFrameworks={enabledFrameworks}
          onUpload={handleConfigChange}
        />
      )}
      {activeTab === "tasks" && (
        <AuditTaskBrowser key={refreshKey} enabledFrameworks={enabledFrameworks} />
      )}
      {isSysAdmin && activeTab === "audit" && <AuditExecutionPanel key={refreshKey} />}
      {isSysAdmin && activeTab === "reports" && (
        <ComplianceReportViewer key={refreshKey} enabledFrameworks={enabledFrameworks} />
      )}
    </div>
  );
}

// ── Inline LearningsWorkspace ─────────────────────────────────────────────────

function LearningsWorkspace({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [pdfStatus, setPdfStatus] = useState<'checking' | 'available' | 'not-generated' | 'generating' | 'error'>('checking');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPdfStatus('checking');
    fetch(`/api/projects/${projectId}/learnings/pdf`, { method: 'HEAD', credentials: 'include' })
      .then((r) => { if (!cancelled) setPdfStatus(r.ok ? 'available' : 'not-generated'); })
      .catch(() => { if (!cancelled) setPdfStatus('not-generated'); });
    return () => { cancelled = true; };
  }, [projectId, pdfKey]);

  async function handleGenerate() {
    setGenerateError(null);
    setPdfStatus('generating');
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/learnings/regenerate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? t("projectWorkspace.learningsGenerateFailed", { status: r.status }));
      }
      setPdfKey((k) => k + 1);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
      setPdfStatus('not-generated');
    }
  }

  if (pdfStatus === 'checking') {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (pdfStatus === 'available') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 dark:text-gray-500">{t("projectWorkspace.learningsPrintHint")}</span>
          {isAdmin && (
            <button
              type="button"
              onClick={handleGenerate}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <RefreshCw className="w-3 h-3" />
              {t("projectWorkspace.regenerate")}
            </button>
          )}
        </div>
        <iframe
          key={pdfKey}
          src={`/api/projects/${projectId}/learnings/pdf`}
          title={t("projectWorkspace.learningsIframeTitle")}
          className="w-full h-[calc(100vh-240px)] border border-gray-200 dark:border-gray-700 rounded"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600" />
      <div>
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{t("projectWorkspace.learningsNoneTitle")}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
          {t("projectWorkspace.learningsRunPrefix")} <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-indigo-600 dark:text-indigo-400">/compound</code> {t("projectWorkspace.learningsRunSuffix")}
          {isAdmin && ` ${t("projectWorkspace.learningsThenGenerate")}`}
        </p>
      </div>
      {generateError && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {generateError}
        </div>
      )}
      {isAdmin && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pdfStatus === 'generating'}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
        >
          {pdfStatus === 'generating' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t("projectWorkspace.generating")}</>
          ) : (
            <><BookOpen className="w-4 h-4" /> {t("projectWorkspace.generateLearningsReport")}</>
          )}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  currentphase: string;
  companyid: string;
  hourlyrate: string | null;
  allocatedhours: string | null;
  pmsystems: string | null;
  securityclassification: string | null;
  // [SCOPE 112 / T006] Replaces `audittype`; set via the Compliance tab.
  activeframeworks: string[];
  // Spec 037 FR-029 — populated when caller accesses via engagement, not direct ownership.
  accessRole?: "owner" | "consulting";
  engagementId?: string;
  clientCompanyName?: string;
}

interface TeamMember {
  userid: string;
  fullname: string | null;
  email: string;
}

type PhaseKey = "Design" | "Implementation" | "QA" | "HumanTesting" | "Beta" | "Release";

const PHASE_KEYS: PhaseKey[] = ["Design", "Implementation", "QA", "HumanTesting", "Beta", "Release"];

const PHASE_DISPLAY_LABELS: Record<PhaseKey, string> = {
  Design: "Design",
  Implementation: "Implementation",
  QA: "QA",
  HumanTesting: "Human Testing",
  Beta: "Beta",
  Release: "Release",
};


// [SCOPE 112 / T006] MODIFIED-BY — the AUDIT_TYPES single-select is gone. Framework
// enablement is edited in one place, the Compliance tab's AuditConfigPanel, which
// writes the per-project appauditconfiguration row. The two selectors that used to
// live on this page wrote `companyprojects.audittype`, which no longer drives anything.
const FRAMEWORK_LABEL: Record<string, string> = {
  NISTSSDF: "NIST SSDF",
  ISO27001: "ISO 27001",
};


function getToken(): string | null {
  return localStorage.getItem("wxkanban_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string; details?: Array<{ field: string; message: string }> };
    let errorMsg = body.error ?? `Request failed: ${res.status}`;
    // Include validation details if present
    if (body.details && body.details.length > 0) {
      const detailStr = body.details.map((d) => `${d.field}: ${d.message}`).join("; ");
      errorMsg = `${errorMsg} — ${detailStr}`;
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}


/**
 * ProjectWorkspacePage — the full 6-phase project lifecycle workspace.
 *
 * URL: /projects/:id  or  /projects/:id/phase/:phaseSlug
 */
export default function ProjectWorkspacePage() {
  const { t } = useTranslation();
  const { id: projectId, phaseSlug } = useParams<{ id: string; phaseSlug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useRealtimeEvents(projectId);

  // Task drawer state — ?task=<taskid> deep-link support
  const [openTaskId, setOpenTaskId] = useState<string | null>(searchParams.get("task"));

  const handleTaskDrawerClose = useCallback(() => {
    setOpenTaskId(null);
    setSearchParams((p) => { p.delete("task"); return p; }, { replace: true });
  }, [setSearchParams]);

  const isAdmin = user?.usertype === "ADMIN";
  const isTeamManager = user?.usertype === "TEAM_MANAGER";

  // Derive the active phase name from slug param; default to the Kanban board
  // when no slug is present (bare /projects/:id) — the Kanban is the primary
  // landing view. The Lifecycle tab now has its own explicit "lifecycle" slug.
  const activePhase = phaseSlug ? (SLUG_TO_PHASE[phaseSlug] ?? null) : null;
  const activeTab =
    phaseSlug === "lifecycle"   ? "lifecycle"   :
    phaseSlug === "devplan"     ? "devplan"     : // [SCOPE 081 / T010]
    phaseSlug === "portfolio"   ? "portfolio"   : // [SCOPE 075 / T7]
    phaseSlug === "matrix"      ? "matrix"      :
    phaseSlug === "kanban"      ? "kanban"      :
    phaseSlug === "stack"       ? "stack"       :
    phaseSlug === "theme"       ? "theme"       :
    phaseSlug === "bugreports"  ? "bugreports"  :
    // [SCOPE 111 / T029] Testing is its own surface, NOT a lifecycle filter.
    // A test suite belongs to a scope and a version, so it must be readable
    // whatever phase the project is in — gating it behind "the project is
    // currently in QA" would hide the suite exactly when someone wants to look
    // at why a release is blocked.
    phaseSlug === "aitesting"   ? "aitesting"   :
    phaseSlug === "usertesting" ? "usertesting" :
    phaseSlug === "compliance"  ? "compliance"  :
    phaseSlug === "learnings"   ? "learnings"   :
    phaseSlug === "kit"         ? "kit"         :
    (activePhase ?? "kanban");



  // ── Project ──────────────────────────────────────────────────────────────
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    hourlyrate: "",
    allocatedhours: "",
    pmsystems: "",
    securityclassification: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Phase assignment state for edit modal
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [phaseAssignments, setPhaseAssignments] = useState<Record<PhaseKey, string>>({
    Design: "",
    Implementation: "",
    QA: "",
    HumanTesting: "",
    Beta: "",
    Release: "",
  });
  const [teamLoading, setTeamLoading] = useState(false);


  const fetchTeamMembersForEdit = useCallback(async () => {
    setTeamLoading(true);
    try {
      const data = await apiFetch<{ members: TeamMember[] }>("/api/team");
      setTeamMembers(data.members ?? []);
    } catch {
      // non-critical - phase assignments will show current values only
    } finally {
      setTeamLoading(false);
    }
  }, []);


  // ── Phases ────────────────────────────────────────────────────────────────
  const [phases, setPhases] = useState<PhaseWithAssignee[]>([]);
  const [phasesLoading, setPhasesLoading] = useState(true);

  const fetchPhases = useCallback(async () => {
    if (!projectId) return;
    setPhasesLoading(true);
    try {
      const data = await apiFetch<{ phases: PhaseWithAssignee[] }>(`/api/projects/${projectId}/phases`);
      setPhases(data.phases);
    } catch {
      // non-critical
    } finally {
      setPhasesLoading(false);
    }
  }, [projectId]);

  // Sync edit form with project data when modal opens
  useEffect(() => {
    if (isEditModalOpen && project) {
      setEditForm({
        name: project.name,
        description: project.description ?? "",
        hourlyrate: project.hourlyrate ?? "",
        allocatedhours: project.allocatedhours ?? "",
        pmsystems: project.pmsystems ?? "",
        securityclassification: project.securityclassification ?? "",
      });
      // Sync phase assignments from phases data
      const assignments: Record<PhaseKey, string> = {
        Design: "",
        Implementation: "",
        QA: "",
        HumanTesting: "",
        Beta: "",
        Release: "",
      };
      phases.forEach((phase) => {
        const phaseName = phase.phasename as PhaseKey;
        if (PHASE_KEYS.includes(phaseName)) {
          assignments[phaseName] = phase.assigneduserid ?? "";
        }
      });
      setPhaseAssignments(assignments);
      // Fetch team members for dropdowns
      fetchTeamMembersForEdit();
    }
  }, [isEditModalOpen, project, phases, fetchTeamMembersForEdit]);

  const fetchProject = useCallback(async () => {

    if (!projectId) return;
    setProjectLoading(true);
    setProjectError(null);
    try {
      const data = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}`);
      setProject(data.project);
      // Initialize edit form with current values
      setEditForm({
        name: data.project.name,
        description: data.project.description ?? "",
        hourlyrate: data.project.hourlyrate ?? "",
        allocatedhours: data.project.allocatedhours ?? "",
        pmsystems: data.project.pmsystems ?? "",
        securityclassification: data.project.securityclassification ?? "",
      });
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : t("projectWorkspace.errFailedLoadProject"));
    } finally {
      setProjectLoading(false);
    }
  }, [projectId]);


  // ── Active phase ──────────────────────────────────────────────────────────

  const activePhaseObj = phases.find((p) => p.phasename === activePhase) ?? null;

  // ── Phase completion ──────────────────────────────────────────────────────
  const [completion, setCompletion] = useState<PhaseCompletion | null>(null);
  const [completionLoading, setCompletionLoading] = useState(false);

  const fetchCompletion = useCallback(async () => {
    if (!projectId || !activePhaseObj) return;
    setCompletionLoading(true);
    try {
      const data = await apiFetch<{ completion: PhaseCompletion }>(
        `/api/projects/${projectId}/phases/${activePhaseObj.id}/completion`
      );
      setCompletion(data.completion);
    } catch {
      // non-critical
    } finally {
      setCompletionLoading(false);
    }
  }, [projectId, activePhaseObj]);

  // ── Phase tasks ───────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!projectId || !activePhaseObj) return;
    setTasksLoading(true);
    try {
      const data = await apiFetch<{ tasks: ProjectTask[] }>(
        `/api/projects/${projectId}/phases/${activePhaseObj.id}/tasks`
      );
      setTasks(data.tasks);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [projectId, activePhaseObj]);

  // ── Phase specs ───────────────────────────────────────────────────────────
  const [specs, setSpecs] = useState<ProjectScope[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);

  const fetchSpecs = useCallback(async () => {
    if (!projectId || !activePhaseObj || activePhase !== "Design") return;
    setSpecsLoading(true);
    try {
      const data = await apiFetch<{ specs: ProjectScope[] }>(
        `/api/projects/${projectId}/phases/${activePhaseObj.id}/specs`
      );
      setSpecs(data.specs);
    } catch {
      setSpecs([]);
    } finally {
      setSpecsLoading(false);
    }
  }, [projectId, activePhaseObj, activePhase]);

  // ── Lifecycle document ─────────────────────────────────────────────────────
  const [lifecycleDoc, setLifecycleDoc] = useState<ProjectDocument | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

  const fetchLifecycle = useCallback(async () => {
    if (!projectId) return;
    setLifecycleLoading(true);
    try {
      const data = await apiFetch<{ documents: ProjectDocument[] }>(
        `/api/projects/${projectId}/documents`
      );
      setLifecycleDoc(data.documents.find((d) => d.doctype === "lifecycle") ?? null);
    } catch {
      // non-critical
    } finally {
      setLifecycleLoading(false);
    }
  }, [projectId]);


  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    fetchProject();
    fetchPhases();
    fetchLifecycle();
  }, [fetchProject, fetchPhases, fetchLifecycle]);


  // Reload phase-specific data when active phase changes
  useEffect(() => {
    if (!activePhaseObj) return;
    setCompletion(null);
    setTasks([]);
    setSpecs([]);
    fetchCompletion();
    if (activePhase === "Design") {
      fetchSpecs();
    } else if (activePhase && activePhase !== "Release") {
      fetchTasks();
    }
  }, [activePhaseObj?.id, activePhase, fetchCompletion, fetchTasks, fetchSpecs]);

  // ── Can control ───────────────────────────────────────────────────────────
  const canControlPhase =
    isAdmin ||
    (isTeamManager &&
      activePhaseObj?.assigneduserid === user?.userid);

  const canEditContent =
    isAdmin ||
    (activePhaseObj?.assigneduserid === user?.userid);

  // [SCOPE 111 / T029, FR-045] Testing permission is MEMBERSHIP-based, not
  // phase-assignment based. A tester records a signoff because they are on the
  // project, not because they happen to own the phase that is currently active
  // — reusing canEditContent here would silently lock out every tester who is
  // not the phase assignee, which is most of them.
  const canRecordTests = Boolean(user?.userid);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAdvancePhase = async () => {
    if (!projectId || !activePhaseObj) return;
    await apiFetch(`/api/projects/${projectId}/phases/${activePhaseObj.id}/advance`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await Promise.all([fetchPhases(), fetchProject(), fetchCompletion()]);
  };

  const handleReopenPhase = async (reason: string) => {
    if (!projectId || !activePhaseObj) return;
    await apiFetch(`/api/projects/${projectId}/phases/${activePhaseObj.id}/reopen`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    await Promise.all([fetchPhases(), fetchProject(), fetchCompletion()]);
  };

  const handleTaskStatusChange = async (taskId: string, status: string) => {
    if (!projectId || !activePhaseObj) return;
    await apiFetch(
      `/api/projects/${projectId}/phases/${activePhaseObj.id}/tasks/${taskId}`,
      { method: "PATCH", body: JSON.stringify({ status }) }
    );
    await Promise.all([fetchTasks(), fetchCompletion()]);
  };

  const handleCreateTask = async (name: string, description?: string) => {
    if (!projectId || !activePhaseObj) return;
    await apiFetch(
      `/api/projects/${projectId}/phases/${activePhaseObj.id}/tasks`,
      { method: "POST", body: JSON.stringify({ name, description }) }
    );
    await Promise.all([fetchTasks(), fetchCompletion()]);
  };

  const handleCreateSpec = async (title: string, content?: string) => {
    if (!projectId || !activePhaseObj) return;
    await apiFetch(
      `/api/projects/${projectId}/phases/${activePhaseObj.id}/specs`,
      { method: "POST", body: JSON.stringify({ title, content: content ?? "" }) }
    );
    await Promise.all([fetchSpecs(), fetchCompletion()]);
  };

  const handleUpdateSpec = async (
    specId: string,
    updates: { title?: string; content?: string }
  ) => {
    if (!projectId || !activePhaseObj) return;
    await apiFetch(
      `/api/projects/${projectId}/phases/${activePhaseObj.id}/specs/${specId}`,
      { method: "PATCH", body: JSON.stringify(updates) }
    );
    await Promise.all([fetchSpecs(), fetchCompletion()]);
  };

  const handleSubmitScope = async (specId: string) => {
    if (!projectId) return;
    await apiFetch(`/api/projects/${projectId}/scopes/${specId}/submit`, { method: "POST", body: JSON.stringify({}) });
    await Promise.all([fetchSpecs(), fetchCompletion()]);
  };

  const handleApproveScope = async (specId: string, action: "approve" | "decline") => {
    if (!projectId) return;
    await apiFetch(`/api/projects/${projectId}/scopes/${specId}/approve`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    await Promise.all([fetchSpecs(), fetchCompletion()]);
  };

  const [openChatScopeId, setOpenChatScopeId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);


  const handleUpdateLifecycle = async (content: string) => {
    if (!projectId || !lifecycleDoc) return;
    await apiFetch(
      `/api/projects/${projectId}/documents/${lifecycleDoc.id}`,
      { method: "PATCH", body: JSON.stringify({ content }) }
    );
    await fetchLifecycle();
  };


  const handleArchiveProject = async () => {
    if (!projectId) return;
    if (!window.confirm(t("projectWorkspace.confirmArchive"))) return;
    await apiFetch(`/api/projects/${projectId}/archive`, { method: "POST", body: JSON.stringify({}) });
    // Drop cached project lists so the dashboard/list reflect the change immediately.
    await queryClient.invalidateQueries({ queryKey: projectKeys.all });
    navigate("/projects");
  };

  const handleDeleteProject = async () => {
    if (!projectId || !isAdmin) return;
    if (!window.confirm(
      t("projectWorkspace.confirmDelete", { name: project?.name ?? t("projectWorkspace.thisProject") })
    )) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      // 404 means it's already gone (e.g. deleted in another tab) — treat as success.
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("projectWorkspace.errFailedDeleteProjectStatus", { status: res.status }));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("projectWorkspace.errFailedDeleteProject"));
      return;
    }
    // Remove this project's cached detail and refresh the lists before leaving.
    queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
    await queryClient.invalidateQueries({ queryKey: projectKeys.all });
    navigate("/admin/dashboard");
  };

  const handlePhaseAssignmentChange = (phase: PhaseKey, userid: string) => {
    setPhaseAssignments((prev) => ({ ...prev, [phase]: userid }));
  };

  const handleUpdateProject = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editForm.name !== project?.name) updates.name = editForm.name;
      if (editForm.description !== (project?.description ?? "")) updates.description = editForm.description || null;
      if (editForm.hourlyrate !== (project?.hourlyrate ?? "")) updates.hourlyrate = editForm.hourlyrate ? Number(editForm.hourlyrate) : undefined;
      if (editForm.allocatedhours !== (project?.allocatedhours ?? "")) updates.allocatedhours = editForm.allocatedhours ? Number(editForm.allocatedhours) : undefined;
      if (editForm.pmsystems !== (project?.pmsystems ?? "")) updates.pmsystems = editForm.pmsystems || null;
      if (editForm.securityclassification !== (project?.securityclassification ?? "")) updates.securityclassification = editForm.securityclassification || null;

      // Update project basic info if there are changes
      if (Object.keys(updates).length > 0) {
        await apiFetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        });
      }

      // Update phase assignments
      const phaseUpdatePromises = phases.map(async (phase) => {
        const phaseName = phase.phasename as PhaseKey;
        if (!PHASE_KEYS.includes(phaseName)) return;

        const newAssignee = phaseAssignments[phaseName];
        const currentAssignee = phase.assigneduserid ?? "";

        // Only update if changed and user has permission
        if (newAssignee !== currentAssignee) {
          const canReassign = isAdmin || (isTeamManager && currentAssignee === user?.userid);
          if (!canReassign) return;

          await apiFetch(`/api/projects/${projectId}/phases/${phase.id}/assign`, {
            method: "PATCH",
            body: JSON.stringify({ assigneduserid: newAssignee || null }),
          });
        }
      });

      await Promise.all(phaseUpdatePromises);
      await fetchPhases();
      await fetchProject();
      setIsEditModalOpen(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t("projectWorkspace.errFailedUpdateProject");
      setSaveError(errorMsg);
    } finally {
      setIsSaving(false);
    }

  };




  // ── Render ────────────────────────────────────────────────────────────────
  if (projectLoading || phasesLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">{t("projectWorkspace.loadingProject")}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (projectError || !project) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <AlertCircle className="w-10 h-10 text-red-400 dark:text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">
            {projectError ?? t("projectWorkspace.projectNotFound")}
          </p>
          <Link
            to="/projects"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {t("projectWorkspace.backToProjects")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const phaseBadgeColors: Record<string, string> = {
    Design: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    Implementation: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    QA: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    HumanTesting: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    Beta: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    Release: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <AppShell>
      <div className="w-full space-y-0">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-1 pb-4 flex-wrap">
          <Link
            to="/projects"
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("projectWorkspace.projects")}
          </Link>

          <div className="flex-1 min-w-0 flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {project.name}
            </h1>
            <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
              phaseBadgeColors[project.currentphase] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            }`}>
              {project.currentphase}
            </span>
            {project.accessRole === "consulting" && (
              <span
                className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                title={t("projectWorkspace.clientEngagementTitle", { name: project.clientCompanyName ?? t("projectWorkspace.client") })}
              >
                {t("projectWorkspace.clientProjectBadge", { name: project.clientCompanyName ?? t("projectWorkspace.client") })}
              </span>
            )}
            {project.accessRole !== "consulting" && (
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                title={t("projectWorkspace.editProject")}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Active frameworks — read-only; edited in the Compliance tab */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t("projectWorkspace.auditLabel")}</span>
            {(project.activeframeworks ?? []).length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {(project.activeframeworks ?? []).map((fw: string) => (
                  <span
                    key={fw}
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  >
                    {FRAMEWORK_LABEL[fw] ?? fw}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">{t("projectWorkspace.noAudit")}</span>
            )}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={handleArchiveProject}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
              title={t("projectWorkspace.archiveProject")}
            >
              <Archive className="w-3.5 h-3.5" />
              {t("projectWorkspace.archive")}
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleDeleteProject}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
              title={t("projectWorkspace.deleteProjectTitle")}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("projectWorkspace.delete")}
            </button>
          )}

        </div>

        {/* Tab navigation */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
          {/* Phase tabs row — Overview + 6 lifecycle phases */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/lifecycle`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "lifecycle"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("projectWorkspace.tabLifecycle")}
              </button>

              {/* [SCOPE 081 / T010] Development Plan tab — sits next to Lifecycle */}
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/devplan`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "devplan"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                {t("projectWorkspace.tabDevelopmentPlan")}
              </button>


              {/* [SCOPE 111 / T029] QA + Human Testing only.
                  The full 6-phase tab bar was removed in 390f6a51 (SCOPE-075)
                  because it behaved as a filter, and it stays removed. These
                  two are here because they now hold something to open — the AI
                  test suite with its live run, and the tester's criteria and
                  signoff — which were otherwise reachable only by typing a URL. */}
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/aitesting`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "aitesting"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <FlaskConical className="w-3.5 h-3.5" />
                {t("phase.qa")}
              </button>

              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/usertesting`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "usertesting"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                {t("phase.humanTesting")}
              </button>

              {/* [SCOPE 075 / T7] Portfolio Analyzer tab */}
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/portfolio`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "portfolio"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                {t("projectWorkspace.tabPortfolioAnalyzer")}
              </button>

              {/* Compliance tab */}
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/compliance`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "compliance"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                {t("projectWorkspace.tabCompliance")}
              </button>

              {/* Learnings tab */}
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/learnings`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "learnings"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                {t("projectWorkspace.tabLearnings")}
              </button>

              {/* Kit tab */}
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/phase/kit`)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 focus:outline-none ${
                  activeTab === "kit"
                    ? "border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10"
                    : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                {t("projectWorkspace.tabKit")}
              </button>
            </div>
          </div>


          {/* Views row — Matrix + Kanban (always visible, no overflow) */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 flex items-center gap-1 px-3 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mr-2 select-none">
              {t("projectWorkspace.views")}
            </span>
            <button
              type="button"
              onClick={() => navigate(`/projects/${project.id}/phase/matrix`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "matrix"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              {t("projectWorkspace.viewMatrix")}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/projects/${project.id}/phase/kanban`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "kanban"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Columns className="w-3 h-3" />
              Kanban
            </button>
            {/* [SCOPE 055 / T008] Stack tab — view + inline-edit the project's Stack & Style */}
            <button
              type="button"
              onClick={() => navigate(`/projects/${project.id}/phase/stack`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "stack"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Code2 className="w-3 h-3" />
              {t("projectWorkspace.viewStack")}
            </button>
            {/* [SCOPE 062 / T011] Theme tab — pick / build / execute the project's visual theme */}
            <button
              type="button"
              onClick={() => navigate(`/projects/${project.id}/phase/theme`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "theme"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Palette className="w-3 h-3" />
              {t("projectWorkspace.viewTheme")}
            </button>
            {/* [SCOPE 063 / T010] Bug Reports tab — install bug-trapping + triage trapped errors */}
            <button
              type="button"
              onClick={() => navigate(`/projects/${project.id}/phase/bugreports`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "bugreports"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              <Bug className="w-3 h-3" />
              {t("projectWorkspace.viewBugReports")}
            </button>
          </div>

          {/* Phase tab bar is embedded above; workspace content below */}
          {/* Kanban board gets no padding — it manages its own layout */}
          <div className={activeTab === "kanban" ? "h-[calc(100vh-200px)] flex flex-col" : "p-5"}>
            {/* Lifecycle tab — serves the generated PDF inline (Spec 021). */}
            {activeTab === "lifecycle" && (
              <iframe
                src={`/api/projects/${project.id}/lifecycle`}
                title={t("projectWorkspace.iframeLifecycle")}
                className="w-full h-[calc(100vh-240px)] border border-gray-200 rounded"
              />
            )}

            {/* [SCOPE 081 / T010] Development Plan tab — lazy-generated PDF (GET /devplan) */}
            {activeTab === "devplan" && (
              <iframe
                src={`/api/projects/${project.id}/devplan`}
                title={t("projectWorkspace.iframeDevplan")}
                className="w-full h-[calc(100vh-240px)] border border-gray-200 rounded"
              />
            )}

            {/* [SCOPE 075 / T8] Portfolio Analyzer tab */}
            {activeTab === "portfolio" && <PortfolioAnalyzerTab projectId={project.id} isAdmin={isAdmin} />}

            {/* [SCOPE 055 / T008] Stack tab — view + inline-edit the ProjectStack doc */}
            {activeTab === "stack" && <StackTabView projectId={project.id} />}

            {/* [SCOPE 062 / T011] Theme tab — the Theme Studio surface */}
            {activeTab === "theme" && <ThemeTabView projectId={project.id} isAdmin={isAdmin} />}

            {/* [SCOPE 063 / T010] Bug Reports tab — install bug-trapping + per-project triage */}
            {activeTab === "bugreports" && <BugReportsTabView projectId={project.id} projectName={project.name} />}

            {/* [SCOPE 111 / T029] Testing surfaces — rendered directly, with no
                dependency on `activePhase` or a projectphases row. The suite is
                per-scope and per-version, so it stays readable regardless of
                which lifecycle phase the project happens to be sitting in.
                The phase views still exist and still carry the completion bar;
                that gating is genuinely phase business, this is not. */}
            {activeTab === "aitesting" && (
              <TestSuitePanel projectId={project.id} canControl={canRecordTests} isAdmin={isAdmin} />
            )}

            {activeTab === "usertesting" && (
              <UserTestPanel projectId={project.id} canEdit={canRecordTests} />
            )}


            {/* Design phase */}
            {activePhase === "Design" && activePhaseObj && (
              <DesignPhaseView
                projectId={project.id}
                phaseId={activePhaseObj.id}
                specs={specs}
                specsLoading={specsLoading}
                completion={completion}
                completionLoading={completionLoading}
                canEdit={canEditContent}
                canApprove={isAdmin || activePhaseObj.assigneduserid === user?.userid}
                canControl={canControlPhase}
                phaseStatus={activePhaseObj.status}
                onCreateSpec={handleCreateSpec}
                onUpdateSpec={handleUpdateSpec}
                onSubmitScope={handleSubmitScope}
                onApproveScope={handleApproveScope}
                onOpenChat={(specId) => setOpenChatScopeId(specId)}
                onAdvancePhase={handleAdvancePhase}
                onReopenPhase={handleReopenPhase}
              />
            )}

            {/* Implementation phase */}
            {activePhase === "Implementation" && activePhaseObj && (
              <ImplementationPhaseView
                projectId={project.id}
                phaseId={activePhaseObj.id}
                tasks={tasks}
                tasksLoading={tasksLoading}
                completion={completion}
                completionLoading={completionLoading}
                canEdit={canEditContent}
                canControl={canControlPhase}
                phaseStatus={activePhaseObj.status}
                onStatusChange={handleTaskStatusChange}
                onCreateTask={handleCreateTask}
                onAdvancePhase={handleAdvancePhase}
                onReopenPhase={handleReopenPhase}
              />
            )}

            {/* QA phase */}
            {activePhase === "QA" && activePhaseObj && (
              <QAPhaseView
                projectId={project.id}
                phaseId={activePhaseObj.id}
                tasks={tasks}
                tasksLoading={tasksLoading}
                completion={completion}
                completionLoading={completionLoading}
                canEdit={canEditContent}
                canControl={canControlPhase}
                phaseStatus={activePhaseObj.status}
                onStatusChange={handleTaskStatusChange}
                onCreateTask={handleCreateTask}
                onAdvancePhase={handleAdvancePhase}
                onReopenPhase={handleReopenPhase}
              />
            )}

            {/* HumanTesting phase */}
            {activePhase === "HumanTesting" && activePhaseObj && (
              <HumanTestingPhaseView
                projectId={project.id}
                phaseId={activePhaseObj.id}
                tasks={tasks}
                tasksLoading={tasksLoading}
                completion={completion}
                completionLoading={completionLoading}
                canEdit={canEditContent}
                canControl={canControlPhase}
                phaseStatus={activePhaseObj.status}
                onStatusChange={handleTaskStatusChange}
                onCreateTask={handleCreateTask}
                onAdvancePhase={handleAdvancePhase}
                onReopenPhase={handleReopenPhase}
              />
            )}

            {/* Beta phase */}
            {activePhase === "Beta" && activePhaseObj && (
              <BetaPhaseView
                projectId={project.id}
                phaseId={activePhaseObj.id}
                tasks={tasks}
                tasksLoading={tasksLoading}
                completion={completion}
                completionLoading={completionLoading}
                canEdit={canEditContent}
                canControl={canControlPhase}
                isAdmin={isAdmin}
                phaseStatus={activePhaseObj.status}
                onStatusChange={handleTaskStatusChange}
                onCreateTask={handleCreateTask}
                onAdvancePhase={handleAdvancePhase}
                onReopenPhase={handleReopenPhase}
              />
            )}

            {/* Release phase */}
            {activePhase === "Release" && activePhaseObj && (
              <ReleasePhaseView
                projectId={project.id}
                phaseId={activePhaseObj.id}
                phases={phases}
                completion={completion}
                completionLoading={completionLoading}
                canControl={canControlPhase}
                phaseStatus={activePhaseObj.status}
                onAdvancePhase={handleAdvancePhase}
                onReopenPhase={handleReopenPhase}
              />
            )}

            {/* Scope Matrix tab */}
            {activeTab === "matrix" && (
              <ScopeMatrixView projectid={project.id} />
            )}

            {/* Scope Kanban tab */}
            {activeTab === "kanban" && (
              <ScopeKanbanBoard
                projectid={project.id}
                usertype={user?.usertype ?? "TEAM_MEMBER"}
                onOpenChat={(scopeId) => setOpenChatScopeId(scopeId)}
                onEditDocument={(doc) => {
                  // Navigate to document edit or open modal
                  // For now, log to console - implement based on your document editing flow
                  console.log("Edit document:", doc);
                  // Example: navigate(`/projects/${project.id}/documents/${doc.id}/edit`);
                }}
              />
            )}


            {/* Compliance tab */}
            {activeTab === "compliance" && (
              <ComplianceWorkspace projectId={project.id} />
            )}

            {/* Learnings tab */}
            {activeTab === "learnings" && (
              <LearningsWorkspace projectId={project.id} isAdmin={isAdmin || isTeamManager} />
            )}

            {/* Kit tab */}
            {activeTab === "kit" && (
              <div className="space-y-6">
                <KitManager projectId={project.id} projectName={project.name} isAdmin={isAdmin} />
                {/* [SCOPE 134 / T027] Which agents may reach THIS project. The token
                    itself is issued in Settings → Company; this bounds its reach. */}
                <ProjectAgentAccessPanel projectId={project.id} isAdmin={isAdmin} />
                {/* [SCOPE 137 / T019] The owner-set Change Impact mode every developer's kit follows. */}
                <ImpactModePanel projectId={project.id} />
              </div>
            )}


            {/* Pending phase (not yet active) */}

            {activePhase && !activePhaseObj && !phasesLoading && activeTab !== "matrix" && activeTab !== "kanban" && (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                <Loader2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t("projectWorkspace.phaseNotStarted")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Drawer overlay */}
      {projectId && (
        <TaskDrawer
          taskid={openTaskId}
          projectid={projectId}
          onClose={handleTaskDrawerClose}
          onTaskUpdated={() => {
            void fetchTasks();
          }}
        />
      )}

      {/* Scope Chat overlay */}
      {openChatScopeId && projectId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-5xl h-[80vh]">
            <ScopeChatView
              scopeid={openChatScopeId}
              projectid={projectId}
              onClose={() => { setOpenChatScopeId(null); void fetchSpecs(); }}
            />
          </div>
        </div>
      )}

      {/* Error Modal */}
      {saveError && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">{t("projectWorkspace.saveFailed")}</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t("projectWorkspace.saveErrorIntro")}
              </p>
              <div className="relative">
                <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap break-all font-mono border border-gray-200 dark:border-gray-700">
                  {saveError}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(saveError);
                  }}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300"
                  title={t("projectWorkspace.copyToClipboard")}
                >
                  {t("projectWorkspace.copy")}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("projectWorkspace.copyHint")}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {t("projectWorkspace.close")}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(saveError);
                  setSaveError(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                {t("projectWorkspace.copyAndClose")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Edit Modal */}
      {isEditModalOpen && project && (

        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t("projectWorkspace.editProject")}</h2>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("projectWorkspace.fieldProjectName")}
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("projectWorkspace.fieldDescription")}
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("projectWorkspace.fieldHourlyRate")}
                  </label>
                  <input
                    type="number"
                    value={editForm.hourlyrate}
                    onChange={(e) => setEditForm({ ...editForm, hourlyrate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t("projectWorkspace.fieldAllocatedHours")}
                  </label>
                  <input
                    type="number"
                    value={editForm.allocatedhours}
                    onChange={(e) => setEditForm({ ...editForm, allocatedhours: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("projectWorkspace.fieldPmSystems")}
                </label>
                <input
                  type="text"
                  value={editForm.pmsystems}
                  onChange={(e) => setEditForm({ ...editForm, pmsystems: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("projectWorkspace.fieldSecurityClassification")}
                </label>
                <input
                  type="text"
                  value={editForm.securityclassification}
                  onChange={(e) => setEditForm({ ...editForm, securityclassification: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {/* [SCOPE 112 / T006] The audit-type select was removed here. Compliance
                  frameworks are per-project and multi-select, and are edited in the
                  Compliance tab so there is exactly one editor for them. */}

              {/* Phase Assignments Section */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Users className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("projectWorkspace.phaseAssignments")}
                  </span>
                </div>

                {teamLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("projectWorkspace.loadingTeamMembers")}
                  </div>
                )}

                {!teamLoading && (
                  <div className="space-y-2">
                    {PHASE_KEYS.map((phase) => {
                      const phaseData = phases.find((p) => p.phasename === phase);
                      const currentAssignee = phaseData?.assigneduserid;
                      const canReassign = isAdmin || (isTeamManager && currentAssignee === user?.userid);
                      
                      return (
                        <div key={phase} className="flex items-center gap-3 py-1.5">
                          <span className="text-sm text-gray-700 dark:text-gray-300 w-32 flex-shrink-0">
                            {PHASE_DISPLAY_LABELS[phase]}
                          </span>
                          <select
                            value={phaseAssignments[phase]}
                            onChange={(e) => handlePhaseAssignmentChange(phase, e.target.value)}
                            disabled={!canReassign || isSaving}
                            className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="">{t("projectWorkspace.unassigned")}</option>
                            {teamMembers.map((member) => (
                              <option key={member.userid} value={member.userid}>
                                {member.fullname
                                  ? `${member.fullname} (${member.email})`
                                  : member.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isAdmin && !isTeamManager && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {t("projectWorkspace.reassignPermissionNote")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSaveError(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {t("projectWorkspace.cancel")}
              </button>

              <button
                type="button"
                onClick={handleUpdateProject}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isSaving ? t("projectWorkspace.saving") : t("projectWorkspace.saveChanges")}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  );
}
