import { ChevronRight } from "lucide-react";
import type { ProjectCard as ProjectCardType, ProjectPanelData, ScopeStatus } from "~/shared/types/projects";
import { useProjectPanel } from "~/client/lib/hooks/useProjects";

interface ProjectCardProps {
  project: ProjectCardType;
  onClick: () => void;
  isSelected?: boolean;
}

const PHASE_DISPLAY: Record<string, string> = {
  Design: "Design",
  Implementation: "Implementation",
  QA: "QA Testing",
  HumanTesting: "Human Testing",
  Beta: "Beta Release",
  Release: "Release",
};

const PHASE_BADGE_CLASSES: Record<string, string> = {
  Design: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Implementation: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  QA: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  HumanTesting: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  Beta: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Release: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const CORE_DOCTYPES = ["spec", "plan", "tasks", "datamodel", "quickstart", "checklist", "contracts"];

function getInitials(fullname: string | null, emailaddr: string | null): string {
  if (fullname) {
    const parts = fullname.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : fullname.slice(0, 2).toUpperCase();
  }
  return emailaddr ? emailaddr.slice(0, 2).toUpperCase() : "??";
}

function buildSummary(data: ProjectPanelData, phase: string): string {
  const parts: string[] = [];

  switch (phase) {
    case "Design": {
      if (data.overview) parts.push("Overview doc");
      parts.push(`${data.scopes.length} scope${data.scopes.length !== 1 ? "s" : ""}`);
      const fullyGen = data.scopes.filter((s) => {
        const types = new Set(s.documents.map((d) => d.doctype));
        return CORE_DOCTYPES.every((t) => types.has(t));
      }).length;
      if (fullyGen > 0) parts.push(`${fullyGen} fully generated`);
      // Lifecycle status breakdown
      const STATUS_LABELS: Partial<Record<ScopeStatus, string>> = {
        implemented: "implemented",
        implementing: "implementing",
        tasks_generated: "tasks ready",
        planned: "planned",
        clarified: "clarified",
        in_review: "in review",
        draft: "draft",
        deferred: "deferred",
      };
      const STATUS_ORDER: ScopeStatus[] = [
        "implemented", "implementing", "tasks_generated",
        "planned", "clarified", "in_review", "draft", "deferred",
      ];
      const statusCounts: Partial<Record<ScopeStatus, number>> = {};
      for (const s of data.scopes) {
        statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
      }
      for (const status of STATUS_ORDER) {
        const count = statusCounts[status];
        if (count) parts.push(`${count} ${STATUS_LABELS[status]}`);
      }
      break;
    }
    case "Implementation": {
      const open = data.scopes.reduce((a, s) => a + s.opencount, 0);
      const active = data.scopes.reduce((a, s) => a + s.inprogresscount, 0);
      const done = data.scopes.reduce((a, s) => a + s.completedtaskcount, 0);
      parts.push(`${open} open`, `${active} active`, `${done} complete`);
      break;
    }
    case "QA": {
      const passing = data.scopes.filter(
        (s) => s.taskcount > 0 && s.completedtaskcount === s.taskcount
      ).length;
      const done = data.scopes.reduce((a, s) => a + s.completedtaskcount, 0);
      const notStarted = data.scopes.filter((s) => s.taskcount === 0).length;
      parts.push(`${passing} passing`, `${done} QA done`, `${notStarted} no tasks`);
      break;
    }
    case "HumanTesting": {
      const open = data.scopes.reduce((a, s) => a + s.opencount, 0);
      const active = data.scopes.reduce((a, s) => a + s.inprogresscount, 0);
      const resolved = data.scopes.reduce((a, s) => a + s.completedtaskcount, 0);
      parts.push(`${open} open`, `${active} active`, `${resolved} resolved`);
      break;
    }
    case "Beta": {
      const open = data.scopes.reduce((a, s) => a + s.opencount, 0);
      const active = data.scopes.reduce((a, s) => a + s.inprogresscount, 0);
      const resolved = data.scopes.reduce((a, s) => a + s.completedtaskcount, 0);
      parts.push(`${open} open`, `${active} active`, `${resolved} resolved`, "ADMIN approval required");
      break;
    }
    case "Release": {
      const openTotal = data.scopes.reduce((a, s) => a + s.opencount, 0);
      parts.push(openTotal === 0 ? "All clear" : `${openTotal} open items`);
      break;
    }
    default:
      parts.push(`${data.scopes.length} scope${data.scopes.length !== 1 ? "s" : ""}`);
  }

  return parts.join(" · ");
}

function PhaseSummaryLine({ projectId, phase }: { projectId: string; phase: string }) {
  const { data, isLoading } = useProjectPanel(projectId);

  if (isLoading) {
    return (
      <span className="flex-shrink-0 inline-block h-2.5 w-40 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
    );
  }
  if (!data) return null;

  const stats = buildSummary(data, phase);

  return (
    <span className="flex-shrink-0 text-[11px] text-gray-500 dark:text-gray-300">{stats}</span>
  );
}

export function ProjectCard({ project, onClick, isSelected = false }: ProjectCardProps) {
  const phaseLabel = PHASE_DISPLAY[project.currentphase] ?? project.currentphase;
  const phaseBadgeClass =
    PHASE_BADGE_CLASSES[project.currentphase] ??
    "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";

  const assignedUser = project.activephase?.assigneduser ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
        isSelected
          ? "bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-500 border border-indigo-200 dark:border-indigo-700"
          : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm"
      }`}
    >
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Name + phase badge + summary */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {project.name}
          </span>
          <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${phaseBadgeClass}`}>
            {phaseLabel}
          </span>
          {project.accessRole === "consulting" && (
            <span
              className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
              title={`Client project — accessed via engagement with ${project.clientCompanyName ?? "Client"}`}
            >
              Client: {project.clientCompanyName ?? "—"}
            </span>
          )}
          <PhaseSummaryLine projectId={project.id} phase={project.currentphase} />
        </div>

        {/* Assignee avatar + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {assignedUser && (
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-semibold">
              {getInitials(assignedUser.fullname, assignedUser.emailaddr)}
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
        </div>
      </div>
    </button>
  );
}
