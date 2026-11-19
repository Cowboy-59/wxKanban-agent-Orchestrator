import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  BookOpen,
  CheckSquare,
  Code2,
  Zap,
  FlaskConical,
  ClipboardList,
  FileQuestion,
  Circle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Rocket,
  Tag,
  ChevronRight,
  ChevronDown,
  Loader2,
  Bug,
  Wrench,
  Star,
  File,
  X,
  Save,
} from "lucide-react";
import type { ProjectPanelData, PanelScope, PanelDocument, PanelTask, ScopeStatus, ProjectScope } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";
import { ScopeChangeImpactLog } from "./ScopeChangeImpactLog"; // [SCOPE 137 / T014]

type TFunc = (key: string, vars?: Record<string, string | number>) => string;

interface ProjectDetailPanelProps {
  projectId: string;
  projectName: string;
  currentPhase: string;
  onBack: () => void;
  onOpen: () => void;
}

// ─── Shared constants ─────────────────────────────────────────────────────────

// Phase display names resolve through the shared `phase.*` namespace (owned centrally).
const PHASE_KEY: Record<string, string> = {
  Design: "phase.design",
  Implementation: "phase.implementation",
  QA: "phase.qa",
  HumanTesting: "phase.humanTesting",
  Beta: "phase.beta",
  Release: "phase.release",
};

function phaseDisplay(t: TFunc, phase: string): string {
  const key = PHASE_KEY[phase];
  return key ? t(key) : phase;
}

const PHASE_BADGE: Record<string, string> = {
  Design:         "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Implementation: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  QA:             "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  HumanTesting:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  Beta:           "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Release:        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const SCOPE_STATUS_BADGE: Record<string, string> = {
  draft:                "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  in_review:            "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
  pending_clarification:"bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
  clarified:            "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  planned:              "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  tasks_generated:      "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  implemented:          "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  qa_passed:            "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  human_tested:         "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  beta_cleared:         "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  released:             "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500",
  deferred:             "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500",
};

const SCOPE_STATUS_LABEL_KEY: Record<string, string> = {
  draft:                "projectPanel.status.draft",
  in_review:            "projectPanel.status.inReview",
  pending_clarification:"projectPanel.status.pending",
  clarified:            "projectPanel.status.clarified",
  planned:              "projectPanel.status.planned",
  tasks_generated:      "projectPanel.status.tasksGenerated",
  implemented:          "projectPanel.status.implemented",
  qa_passed:            "projectPanel.status.qaPassed",
  human_tested:         "projectPanel.status.humanTested",
  beta_cleared:         "projectPanel.status.betaCleared",
  released:             "projectPanel.status.released",
  deferred:             "projectPanel.status.deferred",
};

function scopeStatusLabel(t: TFunc, status: string): string {
  const key = SCOPE_STATUS_LABEL_KEY[status];
  return key ? t(key) : status;
}

const DOCTYPE_ICON: Record<string, React.ReactNode> = {
  spec:       <BookOpen className="w-3 h-3" />,
  plan:       <ClipboardList className="w-3 h-3" />,
  tasks:      <CheckSquare className="w-3 h-3" />,
  datamodel:  <Code2 className="w-3 h-3" />,
  quickstart: <Zap className="w-3 h-3" />,
  checklist:  <CheckSquare className="w-3 h-3" />,
  contracts:  <FileText className="w-3 h-3" />,
  research:   <FlaskConical className="w-3 h-3" />,
  overview:   <BookOpen className="w-3 h-3" />,
  ProjectStack: <Code2 className="w-3 h-3" />, // [SCOPE 055] stack & style doc
};

// spec/plan are methodology doc terms and stay untranslated; the rest resolve through i18n.
const DOCTYPE_LABEL_KEY: Record<string, string> = {
  tasks:      "projectPanel.doctype.tasks",
  datamodel:  "projectPanel.doctype.datamodel",
  quickstart: "projectPanel.doctype.quickstart",
  checklist:  "projectPanel.doctype.checklist",
  contracts:  "projectPanel.doctype.contracts",
  research:   "projectPanel.doctype.research",
  overview:   "projectPanel.doctype.overview",
  ProjectStack: "projectPanel.doctype.stackStyle", // [SCOPE 055]
};

function doctypeLabel(t: TFunc, doctype: string): string {
  if (doctype === "spec") return "Spec";
  if (doctype === "plan") return "Plan";
  const key = DOCTYPE_LABEL_KEY[doctype];
  return key ? t(key) : doctype;
}

const CORE_DOCTYPES = ["spec", "plan", "tasks", "datamodel", "quickstart", "checklist", "contracts"];

const ISSUETYPE_ICON: Record<string, React.ReactNode> = {
  bug:         <Bug className="w-3 h-3 text-red-400 dark:text-red-500" />,
  feature:     <Star className="w-3 h-3 text-indigo-400 dark:text-indigo-400" />,
  enhancement: <Wrench className="w-3 h-3 text-blue-400 dark:text-blue-400" />,
  task:        <CheckSquare className="w-3 h-3 text-gray-400 dark:text-gray-500" />,
};

const ISSUETYPE_LABEL_KEY: Record<string, string> = {
  bug:         "projectPanel.issuetype.bug",
  feature:     "projectPanel.issuetype.feature",
  enhancement: "projectPanel.issuetype.enhancement",
  task:        "projectPanel.issuetype.task",
};

function issuetypeLabel(t: TFunc, type: string): string {
  const key = ISSUETYPE_LABEL_KEY[type];
  return key ? t(key) : type;
}

const TASK_STATUS_DOT: Record<string, string> = {
  open:        "bg-orange-400 dark:text-orange-400 bg-orange-300 dark:bg-orange-500",
  in_progress: "bg-indigo-400 dark:bg-indigo-500",
  completed:   "bg-green-400 dark:bg-green-500",
  dismissed:   "bg-slate--300 bg-slate--600", // Placeholder - will be fixed below
};

// ─── Markdown editor modal ────────────────────────────────────────────────────

function MarkdownEditorModal({
  doc,
  projectId,
  onClose,
  onSaved,
}: {
  doc: PanelDocument;
  projectId: string;
  onClose: () => void;
  onSaved: (docId: string, newContent: string) => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(doc.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = content !== doc.content;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = localStorage.getItem("wxkanban_token");
      const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? t("projectPanel.saveFailed"));
      }
      onSaved(doc.id, content);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectPanel.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-gray-400 dark:text-gray-500">
              {DOCTYPE_ICON[doc.doctype] ?? <File className="w-4 h-4" />}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{doc.title}</span>
            {doc.filepath && (
              <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate">
                {doc.filepath}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Editor */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="flex-1 min-h-0 w-full px-4 py-3 font-mono text-xs text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400 dark:focus:ring-indigo-600"
          style={{ minHeight: "400px" }}
        />
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
      {children}
    </p>
  );
}

function ScopeBadge({ scope }: { scope: PanelScope }) {
  const { t } = useTranslation();
  const cls = SCOPE_STATUS_BADGE[scope.status] ?? "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400";
  const label = scopeStatusLabel(t, scope.status);
  return (
    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function ScopeHeader({
  scope,
  expanded,
  onToggle,
}: {
  scope: PanelScope;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 text-left"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <ChevronRight
          className={`flex-shrink-0 w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="flex-shrink-0 text-[10px] font-mono font-semibold text-gray-400 dark:text-gray-500 w-7">
          {scope.specnumber}
        </span>
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
          {scope.title}
        </span>
      </div>
      <ScopeBadge scope={scope} />
    </button>
  );
}

// ─── Tasks section ────────────────────────────────────────────────────────────

type TaskFilter = "all" | "open" | "closed";

function matchesFilter(task: PanelTask, filter: TaskFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return task.status === "open" || task.status === "in_progress";
  return task.status === "completed" || task.status === "dismissed";
}

const TASK_FILTER_KEY: Record<TaskFilter, string> = {
  all:    "projectPanel.filterAll",
  open:   "projectPanel.filterOpen",
  closed: "projectPanel.filterClosed",
};

function TasksSection({ tasks, loading }: { tasks: PanelTask[] | null; loading: boolean }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [expandedType, setExpandedType] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin" />{t("projectPanel.loadingTasks")}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return <p className="text-[10px] italic text-gray-400 dark:text-gray-500">{t("projectPanel.noTasksForScope")}</p>;
  }

  const filtered = tasks.filter((task) => matchesFilter(task, filter));

  // Group by issuetype
  const groups = new Map<string, PanelTask[]>();
  for (const task of filtered) {
    const key = task.issuetype ?? "task";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }
  const groupEntries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-1.5">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-2">
        {(["all", "open", "closed"] as TaskFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize ${
              filter === f
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {t(TASK_FILTER_KEY[f])} {f !== "all" && `(${tasks.filter((task) => matchesFilter(task, f)).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-[10px] italic text-gray-400 dark:text-gray-500">{t("projectPanel.noFilterTasks", { filter: t(TASK_FILTER_KEY[filter]) })}</p>
      ) : (
        groupEntries.map(([type, typeTasks]) => (
          <div key={type}>
            <button
              type="button"
              onClick={() => setExpandedType((prev) => (prev === type ? null : type))}
              className="w-full flex items-center gap-1.5 py-1 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded px-1 transition-colors"
            >
              <ChevronRight
                className={`flex-shrink-0 w-2.5 h-2.5 text-gray-400 dark:text-gray-500 transition-transform ${expandedType === type ? "rotate-90" : ""}`}
              />
              <span className="flex-shrink-0">
                {ISSUETYPE_ICON[type] ?? <File className="w-3 h-3 text-gray-400" />}
              </span>
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                {issuetypeLabel(t, type)}
              </span>
              <span className="ml-auto text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                {typeTasks.length}
              </span>
            </button>

            {expandedType === type && (
              <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-100 dark:border-gray-700 pl-2">
                {typeTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-0.5">
                    <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${TASK_STATUS_DOT[task.status] ?? "bg-gray-300 dark:bg-gray-600"}`} />
                    <span className="flex-1 min-w-0 text-[10px] text-gray-700 dark:text-gray-300 truncate">
                      {task.name}
                    </span>
                    <span className="flex-shrink-0 text-[9px] text-gray-400 dark:text-gray-500 capitalize whitespace-nowrap">
                      {task.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Open Tasks Popup ────────────────────────────────────────────────────────

function OpenTasksPopup({
  tasks,
  scopeTitle,
  onClose,
}: {
  tasks: PanelTask[];
  scopeTitle: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70">
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold text-gray-900 dark:text-white">{t("projectPanel.openTasks")}</span>
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{scopeTitle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Task list */}
        <div className="max-h-72 overflow-y-auto px-3 py-2 space-y-0.5">
          {openTasks.length === 0 ? (
            <p className="text-[10px] italic text-gray-400 dark:text-gray-500 py-3 text-center">
              {t("projectPanel.noOpenTasks")}
            </p>
          ) : (
            openTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
              >
                <span
                  className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${TASK_STATUS_DOT[task.status] ?? "bg-gray-300 dark:bg-gray-600"}`}
                />
                <span className="flex-shrink-0">
                  {ISSUETYPE_ICON[task.issuetype ?? "task"] ?? <File className="w-3 h-3 text-gray-400" />}
                </span>
                <span className="flex-1 min-w-0 text-[10px] text-gray-700 dark:text-gray-300 truncate">
                  {task.name}
                </span>
                <span className="flex-shrink-0 text-[9px] text-gray-400 dark:text-gray-500 capitalize whitespace-nowrap">
                  {task.status.replace("_", " ")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Task Stats Card ──────────────────────────────────────────────────────────

function TaskStatsCard({
  tasks,
  loading,
  onViewOpen,
}: {
  tasks: PanelTask[];
  loading: boolean;
  onViewOpen: () => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 py-1">
        <Loader2 className="w-3 h-3 animate-spin" />{t("projectPanel.loadingTasks")}
      </div>
    );
  }
  const total = tasks.length;
  const openCount = tasks.filter((task) => task.status === "open" || task.status === "in_progress").length;
  const closedCount = tasks.filter((task) => task.status === "completed" || task.status === "dismissed").length;
  return (
    <button
      type="button"
      onClick={onViewOpen}
      className="w-full grid grid-cols-3 gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-2 py-2 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-colors"
    >
      {[
        { key: "statTotal",  label: t("projectPanel.statTotal"),  value: total,       cls: "text-gray-600 dark:text-gray-400" },
        { key: "statOpen",   label: t("projectPanel.statOpen"),   value: openCount,   cls: "text-orange-500 dark:text-orange-400" },
        { key: "statClosed", label: t("projectPanel.statClosed"), value: closedCount, cls: "text-green-600 dark:text-green-400" },
      ].map(({ key, label, value, cls }) => (
        <div key={key} className="text-center">
          <p className={`text-sm font-bold ${cls}`}>{value}</p>
          <p className="text-[9px] text-gray-400 dark:text-gray-500">{label}</p>
        </div>
      ))}
    </button>
  );
}

// ─── Expandable scope row (shared across all panels) ─────────────────────────

function ExpandableScopeRow({
  scope,
  projectId,
  expanded,
  onToggle,
  children,
}: {
  scope: PanelScope;
  projectId: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<PanelDocument | null>(null);
  const [scopeTasks, setScopeTasks] = useState<PanelTask[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [localDocContent, setLocalDocContent] = useState<Map<string, string>>(new Map());
  const [showOpenTasksPopup, setShowOpenTasksPopup] = useState(false);
  const fetchedRef = useRef(false);

  // Fetch tasks when scope is expanded (once)
  useEffect(() => {
    if (!expanded || fetchedRef.current) return;
    fetchedRef.current = true;
    setTasksLoading(true);
    const token = localStorage.getItem("wxkanban_token");
    fetch(`/api/projects/${projectId}/scopes/${scope.id}/tasks`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setScopeTasks(data as PanelTask[]);
        else setScopeTasks([]);
      })
      .catch(() => setScopeTasks([]))
      .finally(() => setTasksLoading(false));
  }, [expanded, projectId, scope.id]);

  // Deduplicate by doctype — keep first occurrence of each type
  const uniqueDocs = scope.documents.filter(
    (doc, idx, arr) => arr.findIndex((d) => d.doctype === doc.doctype) === idx
  );
  const presentTypes = new Set(uniqueDocs.map((d) => d.doctype));
  const corePresent = CORE_DOCTYPES.filter((dt) => presentTypes.has(dt)).length;
  const fullyGenerated = corePresent === CORE_DOCTYPES.length;

  const handleSaved = (docId: string, newContent: string) => {
    setLocalDocContent((prev) => new Map(prev).set(docId, newContent));
  };

  // Merge local content overrides into docs
  const docsWithOverrides = uniqueDocs.map((d) =>
    localDocContent.has(d.id) ? { ...d, content: localDocContent.get(d.id)! } : d
  );

  return (
    <>
      {showOpenTasksPopup && scopeTasks && (
        <OpenTasksPopup
          tasks={scopeTasks}
          scopeTitle={scope.specnumber}
          onClose={() => setShowOpenTasksPopup(false)}
        />
      )}
      {editingDoc && (
        <MarkdownEditorModal
          doc={editingDoc}
          projectId={projectId}
          onClose={() => setEditingDoc(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="border-b border-gray-100 dark:border-gray-700/60 last:border-0">
        {/* Row header — always visible */}
        <div className={`py-2.5 rounded transition-colors ${expanded ? "bg-indigo-50/40 dark:bg-indigo-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/20"}`}>
          <ScopeHeader scope={scope} expanded={expanded} onToggle={onToggle} />
        </div>

        {/* Inline expansion below row */}
        {expanded && (
          <div className="pb-3 pl-6 pr-1 space-y-3">
            {/* Phase-specific content (e.g. action buttons) */}
            {children && <div>{children}</div>}

            {/* Documents */}
            {docsWithOverrides.length > 0 && (
              <div>
                <SectionLabel>
                  {t("projectPanel.documents")}
                  {fullyGenerated && (
                    <span className="ml-2 normal-case font-normal text-[9px] text-green-500 dark:text-green-400">{t("projectPanel.completeCheck")}</span>
                  )}
                </SectionLabel>

                {/* Doc chips */}
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {docsWithOverrides.map((doc) => {
                    const icon = DOCTYPE_ICON[doc.doctype] ?? <FileQuestion className="w-3 h-3" />;
                    const label = doctypeLabel(t, doc.doctype);
                    const active = expandedDocId === doc.id;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setExpandedDocId((prev) => (prev === doc.id ? null : doc.id))}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          active
                            ? "bg-indigo-200 text-indigo-800 dark:bg-indigo-800 dark:text-indigo-200"
                            : "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                        }`}
                      >
                        {icon}{label}
                      </button>
                    );
                  })}
                </div>

                {/* Filename row / stats card for active doc */}
                {expandedDocId && (() => {
                  const activeDoc = docsWithOverrides.find((d) => d.id === expandedDocId);
                  if (!activeDoc) return null;

                  // Tasks chip → show stats card instead of file button
                  if (activeDoc.doctype === "tasks") {
                    return (
                      <TaskStatsCard
                        tasks={scopeTasks ?? []}
                        loading={tasksLoading}
                        onViewOpen={() => setShowOpenTasksPopup(true)}
                      />
                    );
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => setEditingDoc(activeDoc)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors text-left group"
                    >
                      <File className="flex-shrink-0 w-3.5 h-3.5 text-gray-400 dark:text-gray-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-gray-700 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-300 truncate">
                          {activeDoc.title}
                        </p>
                        {activeDoc.filepath && (
                          <p className="text-[9px] font-mono text-gray-400 dark:text-gray-300 truncate">
                            {activeDoc.filepath}
                          </p>
                        )}
                      </div>
                      <ExternalLink className="flex-shrink-0 w-3 h-3 text-gray-300 dark:text-gray-400 group-hover:text-indigo-400 dark:group-hover:text-indigo-500" />
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Tasks */}
            <div>
              <SectionLabel>{t("projectPanel.tasksCount", { done: scope.completedtaskcount, total: scope.taskcount })}</SectionLabel>
              {scopeTasks && scopeTasks.length > 0 && (
                (() => {
                  const openCount = scopeTasks.reduce(
                    (acc, task) => acc + (task.status === "open" || task.status === "in_progress" ? 1 : 0),
                    0
                  );
                  const closedCount = scopeTasks.reduce(
                    (acc, task) => acc + (task.status === "completed" || task.status === "dismissed" ? 1 : 0),
                    0
                  );
                  return (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                      {t("projectPanel.specOpenClosed", { num: scope.specnumber, open: openCount, closed: closedCount })}
                    </p>
                  );
                })()
              )}
              <TasksSection tasks={scopeTasks} loading={tasksLoading} />
            </div>

            {/* [SCOPE 137 / T014] Read-only Change Impact agreement log for this scope */}
            <ScopeChangeImpactLog projectId={projectId} scopeId={scope.id} />
          </div>
        )}
      </div>
    </>
  );
}

// ─── DESIGN phase panel ───────────────────────────────────────────────────────

const COMPLETE_STATUSES = new Set(["implemented", "qa_passed", "human_tested", "beta_cleared", "released"]);
const ACTIVE_DESIGN_STATUSES = new Set(["draft", "in_review"]);

function ScopeActionButtons({
  scope,
  projectId,
  onStatusChange,
}: {
  scope: PanelScope;
  projectId: string;
  onStatusChange: (newStatus: ScopeStatus) => void;
}) {
  const { t } = useTranslation();
  const [updating, setUpdating] = useState(false);

  const patchStatus = async (status: ScopeStatus) => {
    setUpdating(true);
    try {
      const token = localStorage.getItem("wxkanban_token");
      const res = await fetch(`/api/projects/${projectId}/scopes/${scope.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      onStatusChange(status);
    } finally {
      setUpdating(false);
    }
  };

  if (COMPLETE_STATUSES.has(scope.status)) {
    return (
      <button
        type="button"
        disabled={updating}
        onClick={() => void patchStatus("in_review")}
        className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
      >
        {t("projectPanel.reopen")}
      </button>
    );
  }
  if (scope.status === "deferred") {
    return (
      <button
        type="button"
        disabled={updating}
        onClick={() => void patchStatus("in_review")}
        className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-50 transition-colors"
      >
        {t("projectPanel.reactivate")}
      </button>
    );
  }
  if (scope.status === "pending_clarification") {
    return (
      <button
        type="button"
        disabled={updating}
        onClick={() => void patchStatus("clarified")}
        className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors"
      >
        {t("projectPanel.markClarified")}
      </button>
    );
  }
  if (ACTIVE_DESIGN_STATUSES.has(scope.status)) {
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          disabled={updating}
          onClick={() => void patchStatus("deferred")}
          className="px-2 py-0.5 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {t("projectPanel.defer")}
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => void patchStatus("pending_clarification")}
          className="px-2 py-0.5 rounded text-[10px] font-medium border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
        >
          {t("projectPanel.needsClarification")}
        </button>
      </div>
    );
  }
  return null;
}

// [SCOPE 098 / T003] Per-scope Delete control. Hard delete + cascade: the scope,
// its tasks, and its documents/spec-phases/scope-chat/test-plans all go. A
// window.confirm states the impact (task + document counts) before proceeding.
function ScopeDeleteButton({
  scope,
  projectId,
  onDeleted,
}: {
  scope: PanelScope;
  projectId: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      t("projectPanel.deleteScopeConfirm", {
        num: scope.specnumber,
        title: scope.title,
        tasks: scope.taskcount ?? 0,
        docs: scope.documents?.length ?? 0,
      })
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem("wxkanban_token");
      const res = await fetch(`/api/projects/${projectId}/scopes/${scope.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) window.alert(t("projectPanel.deleteScopeError"));
    } catch {
      window.alert(t("projectPanel.deleteScopeError"));
    } finally {
      setDeleting(false);
      // Refetch on both success and error → the list resyncs to server truth
      // (a stale 404 delete disappears; a real delete is reflected). [FR-004]
      onDeleted();
    }
  };

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={() => void handleDelete()}
      title={t("projectPanel.deleteScope")}
      className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
    >
      {t("projectPanel.deleteScope")}
    </button>
  );
}

// [SCOPE 103 / T006] BEGIN — Per-scope Archive / Unarchive control (non-destructive). Archive
// hides the scope from every working surface; Unarchive restores its prior status.
// Any project member. Refetches on success/error so the list resyncs to server truth.
function ScopeArchiveButton({
  scope,
  projectId,
  onChanged,
}: {
  scope: PanelScope;
  projectId: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const isArchived = scope.status === "archived";

  const handleClick = async () => {
    if (!isArchived) {
      const confirmed = window.confirm(
        t("projectPanel.archiveScopeConfirm", {
          num: scope.specnumber,
          title: scope.title,
          defaultValue:
            "Archive scope {{num}} ({{title}})? It will be hidden from all views but can be restored.",
        })
      );
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem("wxkanban_token");
      const res = await fetch(
        `/api/projects/${projectId}/scopes/${scope.id}/${isArchived ? "unarchive" : "archive"}`,
        { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) window.alert(t("projectPanel.archiveScopeError", { defaultValue: "Could not archive/unarchive the scope." }));
    } catch {
      window.alert(t("projectPanel.archiveScopeError", { defaultValue: "Could not archive/unarchive the scope." }));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const label = isArchived
    ? t("projectPanel.unarchiveScope", { defaultValue: "Unarchive" })
    : t("projectPanel.archiveScope", { defaultValue: "Archive" });

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleClick()}
      title={label}
      className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
    >
      {label}
    </button>
  );
}
// [SCOPE 103 / T006] END

function DesignScopeRow({
  scope,
  projectId,
  onRefetch,
  expanded,
  onToggle,
}: {
  scope: PanelScope;
  projectId: string;
  onRefetch: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [localStatus, setLocalStatus] = useState(scope.status);

  useEffect(() => { setLocalStatus(scope.status); }, [scope.status]);

  const handleStatusChange = (newStatus: ScopeStatus) => {
    setLocalStatus(newStatus);
    onRefetch();
  };

  const displayScope = localStatus !== scope.status ? { ...scope, status: localStatus } : scope;

  return (
    <ExpandableScopeRow scope={displayScope} projectId={projectId} expanded={expanded} onToggle={onToggle}>
      <ScopeActionButtons scope={displayScope} projectId={projectId} onStatusChange={handleStatusChange} />
      <ScopeArchiveButton scope={displayScope} projectId={projectId} onChanged={onRefetch} />
      <ScopeDeleteButton scope={displayScope} projectId={projectId} onDeleted={onRefetch} />
    </ExpandableScopeRow>
  );
}

// [SCOPE 103 / T006] BEGIN — Restore view: opt-in "show archived" list. Archived scopes are
// hidden from every working surface, so this collapsible section is the only entrance to
// Unarchive them (wire-the-entrance). Fetches on demand via ?includeArchived=true; refetches
// the whole panel on any archive/unarchive so both lists resync to server truth.
function ArchivedScopesSection({ projectId, onRefetch }: { projectId: string; onRefetch: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<PanelScope[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const panelId = `archived-scopes-${projectId}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const token = localStorage.getItem("wxkanban_token");
    fetch(`/api/projects/${projectId}/scopes?includeArchived=true`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { scopes?: ProjectScope[] }) => {
        if (cancelled) return;
        const list = (json.scopes ?? []).filter((s) => s.status === "archived");
        setScopes(
          list.map((s) => ({
            id: s.id,
            specnumber: s.specnumber,
            title: s.title,
            status: s.status,
            taskcount: s.taskcount,
            completedtaskcount: s.completedtaskcount,
            opencount: s.opencount,
            inprogresscount: s.inprogresscount,
            documents: s.documents ?? [],
          }))
        );
      })
      // Keep the error path distinct from the empty state — telling a user with
      // archived scopes "none" on a transient failure would hide their restore path.
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, reloadKey]);

  // Unarchive removes the scope from the archived list AND returns it to the working panel.
  const handleChanged = () => {
    setReloadKey((k) => k + 1);
    onRefetch();
  };

  return (
    <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {t("projectPanel.showArchived", { defaultValue: "Archived scopes" })}
        {scopes && open && !error ? <span className="text-gray-300 dark:text-gray-600">({scopes.length})</span> : null}
      </button>

      {open && (
        <div id={panelId} className="mt-2 space-y-1.5">
          {loading && <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">{t("common.loading", { defaultValue: "Loading…" })}</p>}
          {!loading && error && (
            <div className="flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400" role="alert">
              <span>{t("projectPanel.archivedScopesLoadError", { defaultValue: "Couldn't load archived scopes." })}</span>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="underline hover:no-underline"
              >
                {t("common.retry", { defaultValue: "Retry" })}
              </button>
            </div>
          )}
          {!loading && !error && scopes && scopes.length === 0 && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
              {t("projectPanel.noArchivedScopes", { defaultValue: "No archived scopes." })}
            </p>
          )}
          {!loading && !error &&
            scopes?.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/20"
              >
                <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{s.specnumber}</span>
                <span className="flex-1 min-w-0 truncate text-[11px] text-gray-600 dark:text-gray-300">{s.title}</span>
                <ScopeArchiveButton scope={s} projectId={projectId} onChanged={handleChanged} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
// [SCOPE 103 / T006] END

function DesignPanel({ data, projectId, onRefetch }: { data: ProjectPanelData; projectId: string; onRefetch: () => void }) {
  const { t } = useTranslation();
  const [expandedScopeId, setExpandedScopeId] = useState<string | null>(null);

  const fullyGenCount = data.scopes.filter((s) => {
    const types = new Set(s.documents.map((d) => d.doctype));
    return CORE_DOCTYPES.every((dt) => types.has(dt));
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        {data.overview && (
          <span className="flex items-center gap-1"><BookOpen className="w-3 h-3 text-indigo-500" />{t("projectPanel.overviewDoc")}</span>
        )}
        <span>{t(data.scopes.length === 1 ? "projectPanel.scopeCountOne" : "projectPanel.scopeCountOther", { n: data.scopes.length })}</span>
        <span className="text-green-600 dark:text-green-400">{t("projectPanel.fullyGenerated", { n: fullyGenCount })}</span>
      </div>

      {data.overview && (
        <div className="rounded-lg border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-900/10 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
            <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
            {data.overview.title}
            {data.overview.filepath && (
              <span className="font-mono text-[10px] text-indigo-400 dark:text-indigo-500 truncate">
                {data.overview.filepath}
              </span>
            )}
          </div>
        </div>
      )}

      {data.scopes.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t("projectPanel.noScopesCreatedYet")}</p>
      ) : (
        <>
          <SectionLabel>{t("projectPanel.scopeDocuments")}</SectionLabel>
          {data.scopes.map((s) => (
            <DesignScopeRow
              key={s.id}
              scope={s}
              projectId={projectId}
              onRefetch={onRefetch}
              expanded={expandedScopeId === s.id}
              onToggle={() => setExpandedScopeId((prev) => (prev === s.id ? null : s.id))}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── IMPLEMENTATION phase panel ───────────────────────────────────────────────

function ImplementationPanel({ data, projectId }: { data: ProjectPanelData; projectId: string }) {
  const { t } = useTranslation();
  const [expandedScopeId, setExpandedScopeId] = useState<string | null>(null);
  const totals = data.scopes.reduce(
    (acc, s) => ({ total: acc.total + s.taskcount, completed: acc.completed + s.completedtaskcount, inprogress: acc.inprogress + s.inprogresscount, open: acc.open + s.opencount }),
    { total: 0, completed: 0, inprogress: 0, open: 0 }
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "open",       label: t("projectPanel.statOpen"),       value: totals.open,       cls: "text-gray-600 dark:text-gray-400" },
          { key: "inprogress", label: t("projectPanel.statInProgress"), value: totals.inprogress, cls: "text-indigo-600 dark:text-indigo-400" },
          { key: "complete",   label: t("projectPanel.statComplete"),   value: totals.completed,  cls: "text-green-600 dark:text-green-400" },
        ].map(({ key, label, value, cls }) => (
          <div key={key} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-2 py-2 text-center">
            <p className={`text-base font-bold ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
          </div>
        ))}
      </div>
      {data.scopes.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t("projectPanel.noScopes")}</p>
      ) : (
        <>
          <SectionLabel>{t("projectPanel.progressByScope")}</SectionLabel>
          {data.scopes.map((s) => (
            <ExpandableScopeRow
              key={s.id} scope={s} projectId={projectId}
              expanded={expandedScopeId === s.id}
              onToggle={() => setExpandedScopeId((prev) => (prev === s.id ? null : s.id))}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── QA phase panel ───────────────────────────────────────────────────────────

function QAPanel({ data, projectId }: { data: ProjectPanelData; projectId: string }) {
  const { t } = useTranslation();
  const [expandedScopeId, setExpandedScopeId] = useState<string | null>(null);
  const totals = data.scopes.reduce(
    (acc, s) => ({ total: acc.total + s.taskcount, completed: acc.completed + s.completedtaskcount }),
    { total: 0, completed: 0 }
  );
  const notStarted = data.scopes.filter((s) => s.taskcount === 0).length;
  const passing = data.scopes.filter((s) => s.taskcount > 0 && s.completedtaskcount === s.taskcount).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "passing",    label: t("projectPanel.statScopesPassing"), value: passing,          cls: "text-green-600 dark:text-green-400" },
          { key: "done",       label: t("projectPanel.statQaTasksDone"),   value: totals.completed, cls: "text-indigo-600 dark:text-indigo-400" },
          { key: "notasks",    label: t("projectPanel.statNoTasks"),       value: notStarted,       cls: "text-gray-400 dark:text-gray-500" },
        ].map(({ key, label, value, cls }) => (
          <div key={key} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-2 py-2 text-center">
            <p className={`text-base font-bold ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
          </div>
        ))}
      </div>
      {data.scopes.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">{t("projectPanel.noScopes")}</p>
      ) : (
        <>
          <SectionLabel>{t("projectPanel.qaStatusByScope")}</SectionLabel>
          {data.scopes.map((s) => (
            <ExpandableScopeRow
              key={s.id} scope={s} projectId={projectId}
              expanded={expandedScopeId === s.id}
              onToggle={() => setExpandedScopeId((prev) => (prev === s.id ? null : s.id))}
            >
              {s.taskcount > 0 ? (
                s.completedtaskcount === s.taskcount ? (
                  <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" />{t("projectPanel.allTestsPassed", { n: s.taskcount })}
                  </span>
                ) : s.inprogresscount > 0 ? (
                  <span className="flex items-center gap-1 text-[10px] text-indigo-500 dark:text-indigo-400">
                    <Clock className="w-3 h-3" />{t("projectPanel.inProgressDone", { n: s.inprogresscount, done: s.completedtaskcount, total: s.taskcount })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                    <Circle className="w-3 h-3" />{t("projectPanel.completeCount", { done: s.completedtaskcount, total: s.taskcount })}
                  </span>
                )
              ) : (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">{t("projectPanel.noQaTasks")}</p>
              )}
            </ExpandableScopeRow>
          ))}
        </>
      )}
    </div>
  );
}

// ─── HUMAN TESTING / BETA phase panel ────────────────────────────────────────

function HumanTestingPanel({ data, phase, projectId }: { data: ProjectPanelData; phase: string; projectId: string }) {
  const { t } = useTranslation();
  const [expandedScopeId, setExpandedScopeId] = useState<string | null>(null);
  const isBeta = phase === "Beta";
  const openTotal = data.scopes.reduce((acc, s) => acc + s.opencount, 0);
  const resolvedTotal = data.scopes.reduce((acc, s) => acc + s.completedtaskcount, 0);
  const inprogressTotal = data.scopes.reduce((acc, s) => acc + s.inprogresscount, 0);
  return (
    <div className="space-y-4">
      {isBeta && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-purple-100 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-900/10 text-xs text-purple-700 dark:text-purple-300">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {t("projectPanel.betaApprovalNotice")}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "open",     label: t("projectPanel.statOpen"),     value: openTotal,       cls: "text-amber-600 dark:text-amber-400" },
          { key: "active",   label: t("projectPanel.statActive"),   value: inprogressTotal, cls: "text-indigo-600 dark:text-indigo-400" },
          { key: "resolved", label: t("projectPanel.statResolved"), value: resolvedTotal,   cls: "text-green-600 dark:text-green-400" },
        ].map(({ key, label, value, cls }) => (
          <div key={key} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-2 py-2 text-center">
            <p className={`text-base font-bold ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
          </div>
        ))}
      </div>
      {data.scopes.length > 0 && (
        <>
          <SectionLabel>{t("projectPanel.feedbackByScope")}</SectionLabel>
          {data.scopes.map((s) => (
            <ExpandableScopeRow
              key={s.id} scope={s} projectId={projectId}
              expanded={expandedScopeId === s.id}
              onToggle={() => setExpandedScopeId((prev) => (prev === s.id ? null : s.id))}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── RELEASE phase panel ──────────────────────────────────────────────────────

// Labels resolve through the shared `phase.*` namespace (owned centrally) via phaseDisplay.
const RELEASE_PHASES = [
  { key: "Design" },
  { key: "Implementation" },
  { key: "QA" },
  { key: "HumanTesting" },
  { key: "Beta" },
  { key: "Release" },
] as const;

function ReleasePanel({ data, projectId }: { data: ProjectPanelData; projectId: string }) {
  const { t } = useTranslation();
  const [expandedScopeId, setExpandedScopeId] = useState<string | null>(null);
  const allClear = data.scopes.every((s) => s.opencount === 0);
  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
        allClear
          ? "border-green-100 dark:border-green-800/40 bg-green-50/50 dark:bg-green-900/10 text-green-700 dark:text-green-300"
          : "border-amber-100 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300"
      }`}>
        {allClear
          ? <><CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{t("projectPanel.allScopesClear")}</>
          : <><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{t("projectPanel.openItemsRemain", { n: data.scopes.reduce((a, s) => a + s.opencount, 0) })}</>
        }
      </div>
      <SectionLabel>{t("projectPanel.phaseChecklist")}</SectionLabel>
      <div className="space-y-1">
        {RELEASE_PHASES.map(({ key }) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            {key === "Release" ? <Tag className="w-3.5 h-3.5 text-green-500 dark:text-green-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-400 dark:text-green-500" />}
            <span className={key === "Release" ? "font-semibold text-green-700 dark:text-green-300" : "text-gray-600 dark:text-gray-400"}>{phaseDisplay(t, key)}</span>
            {key !== "Release" && <span className="text-[10px] text-green-500 dark:text-green-400">{t("projectPanel.statComplete")}</span>}
          </div>
        ))}
      </div>
      {data.scopes.length > 0 && !allClear && (
        <>
          <SectionLabel>{t("projectPanel.openItemsByScope")}</SectionLabel>
          {data.scopes.filter((s) => s.opencount > 0).map((s) => (
            <ExpandableScopeRow
              key={s.id} scope={s} projectId={projectId}
              expanded={expandedScopeId === s.id}
              onToggle={() => setExpandedScopeId((prev) => (prev === s.id ? null : s.id))}
            >
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                {t("projectPanel.openResolved", { open: s.opencount, done: s.completedtaskcount, total: s.taskcount })}
              </p>
            </ExpandableScopeRow>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Phase router ─────────────────────────────────────────────────────────────

function PhaseContent({ data, projectId, onRefetch }: { data: ProjectPanelData; projectId: string; onRefetch: () => void }) {
  const { t } = useTranslation();
  let phasePanel: JSX.Element;
  switch (data.phase) {
    case "Design":         phasePanel = <DesignPanel data={data} projectId={projectId} onRefetch={onRefetch} />; break;
    case "Implementation": phasePanel = <ImplementationPanel data={data} projectId={projectId} />; break;
    case "QA":             phasePanel = <QAPanel data={data} projectId={projectId} />; break;
    case "HumanTesting":
    case "Beta":           phasePanel = <HumanTestingPanel data={data} phase={data.phase} projectId={projectId} />; break;
    case "Release":        phasePanel = <ReleasePanel data={data} projectId={projectId} />; break;
    default:
      phasePanel = (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Rocket className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-gray-400 dark:text-gray-500">{t("projectPanel.phaseView", { phase: phaseDisplay(t, data.phase) })}</p>
        </div>
      );
  }
  // [SCOPE 103 / T006] The archived-scopes restore view lives here, not inside
  // DesignPanel, so a scope archived during Design stays reachable/unarchivable
  // after the project advances past Design (the feature is reversible in any phase).
  return (
    <>
      {phasePanel}
      <ArchivedScopesSection projectId={projectId} onRefetch={onRefetch} />
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ProjectDetailPanel({
  projectId,
  projectName,
  currentPhase,
  onBack,
  onOpen,
}: ProjectDetailPanelProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<ProjectPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const handleRefetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/panel`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: ProjectPanelData & { error?: string }) => {
        if (json.error) throw new Error(json.error);
        setData({ phase: json.phase ?? currentPhase, overview: json.overview ?? null, overviewexcerpt: json.overviewexcerpt ?? null, scopes: json.scopes ?? [] });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t("projectPanel.failedToLoad")))
      .finally(() => setLoading(false));
  }, [projectId, currentPhase, refetchKey]);

  const phaseLabel = phaseDisplay(t, currentPhase);
  const phaseBadgeClass = PHASE_BADGE[currentPhase] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("projectPanel.allProjects")}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{projectName}</h2>
          <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${phaseBadgeClass}`}>
            {phaseLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-colors"
        >
          {t("projectPanel.open")}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg" />)}
            </div>
            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/3 mt-4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded" />
            ))}
          </div>
        )}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!loading && !error && data && <PhaseContent data={data} projectId={projectId} onRefetch={handleRefetch} />}
      </div>
    </div>
  );
}
