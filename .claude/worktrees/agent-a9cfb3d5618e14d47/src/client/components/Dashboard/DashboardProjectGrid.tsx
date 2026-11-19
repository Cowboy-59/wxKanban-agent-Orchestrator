/**
 * DashboardProjectGrid — shared project-area panel for the admin and team
 * dashboards (spec 002 FR-106/107/108).
 *
 * Renders the Project Overview panel: header + Active/Branched sections of
 * project cards. Each card shows lifecycle phase progress and four embedded
 * per-project document links (Project Overview / Project Lifecycle /
 * Audit Report / Compound Learnings) with status badges fetched from
 * /api/admin/doc-status.
 *
 * Admin-only controls (the "New" button and per-card edit pencil) appear only
 * when the parent supplies the corresponding callback. Team dashboards omit
 * both callbacks and see a read-only grid.
 */

import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileSearch,
  FileText,
  GitBranch,
  ListChecks,
  Pencil,
  Plus,
  Shield,
} from "lucide-react";
import type { ProjectCard } from "~/shared/types/projects";
import { useTranslation } from "../../i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectDocStatus {
  projectOverview: string | null;
  projectLifecycle: string | null;
  auditReport: string | null;
  compoundLearning: string | null;
  projectScopeAnalysis: string | null; // [SCOPE 060 / T014]
  developmentPlan: string | null; // [SCOPE 081 / T009]
  outstandingTaskCount: number;
}

interface DocStatusResponse {
  projects: Record<string, ProjectDocStatus>;
  databaseErd?: string | null; // [SCOPE 021 / T016] global ER diagram timestamp
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_ORDER = ["Design", "Implementation", "QA", "HumanTesting", "Beta", "Release"] as const;
type PhaseKey = typeof PHASE_ORDER[number];

const PHASE_DISPLAY: Record<PhaseKey, string> = {
  Design: "Design",
  Implementation: "Implementation",
  QA: "QA Testing",
  HumanTesting: "Human Testing",
  Beta: "Beta Release",
  Release: "Release",
};

// [SCOPE 112 / T006] MODIFIED-BY — a project carries a SET of frameworks, not one
// audittype. NISTSSDF and ISO27001 join the palette; an unrecognised value still
// renders with a neutral badge rather than crashing the card.
const AUDIT_BADGE: Record<string, string> = {
  GDPR:     "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  HIPAA:    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  HITRUST:  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  SOC2:     "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  NISTSSDF: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  ISO27001: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const NEUTRAL_BADGE = "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-white";

const FRAMEWORK_LABEL: Record<string, string> = {
  NISTSSDF: "NIST SSDF",
  ISO27001: "ISO 27001",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// ─── Report link card ─────────────────────────────────────────────────────────

type ReportLinkCardProps = {
  icon: ReactNode;
  title: string;
  updatedAt: string | null;
  loading: boolean;
  busy?: boolean;
} & (
  | { to: string; onClick?: never }
  | { onClick: (e: React.MouseEvent) => void; to?: never }
);

function ReportLinkCard(props: ReportLinkCardProps) {
  const { t } = useTranslation();
  const { icon, title, updatedAt, loading, busy } = props;
  const inner = (
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
        {icon}
        {title}
      </span>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {!loading && (
          <span className="text-xs text-indigo-600 dark:text-indigo-400">
            {busy
              ? t("projectGrid.opening")
              : updatedAt
                ? t("projectGrid.lastUpdated", { date: fmtDate(updatedAt) })
                : t("projectGrid.notCreated")}
          </span>
        )}
        <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-indigo-500" />
      </div>
    </div>
  );

  const className =
    "block w-full text-left bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group disabled:opacity-60 disabled:cursor-not-allowed";

  if ("onClick" in props && props.onClick) {
    return (
      <button type="button" onClick={props.onClick} disabled={busy} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={props.to!} className={className}>
      {inner}
    </Link>
  );
}

// ─── Project overview card ────────────────────────────────────────────────────

function ProjectOverviewCard({
  project,
  onEdit,
  docStatus,
  databaseErd,
  docStatusLoading,
}: {
  project: ProjectCard;
  onEdit?: (p: ProjectCard) => void;
  docStatus: ProjectDocStatus | null;
  databaseErd: string | null;
  docStatusLoading: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentIndex = PHASE_ORDER.indexOf(project.currentphase as PhaseKey);
  const frameworks = project.activeframeworks ?? [];
  const [openingOverview, setOpeningOverview] = useState(false);
  // Cards open collapsed: the panel ends at the Release line and the document
  // tiles stay hidden until the reader expands this card.
  const [expanded, setExpanded] = useState(false);

  // Spec 025 FR-016 — open the AI editor bound to this project. Edit-if-exists
  // / create-if-not is handled server-side by A12.
  async function handleOpenOverview(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (openingOverview) return;
    setOpeningOverview(true);
    try {
      const res = await fetch(`/api/overview/draft-by-project/${project.id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("projectGrid.failedOpenOverviewStatus", { status: res.status }));
      }
      const { draftid } = (await res.json()) as { draftid: string };
      navigate(`/overview/${draftid}`);
    } catch (err) {
      // Best-effort surface — keep the dashboard alive on failure.
      window.alert(err instanceof Error ? err.message : t("projectGrid.failedOpenOverview"));
      setOpeningOverview(false);
    }
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group">
      <Link to={`/projects/${project.id}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
              {project.name}
            </p>
            {project.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {project.description}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {frameworks.length > 0 ? (
                frameworks.map((fw: string) => (
                  <span
                    key={fw}
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${AUDIT_BADGE[fw] ?? NEUTRAL_BADGE}`}
                  >
                    <Shield className="w-3 h-3" />
                    {FRAMEWORK_LABEL[fw] ?? fw}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-white px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600">
                  {t("projectGrid.noAudit")}
                </span>
              )}
              {onEdit && (
                <button
                  type="button"
                  title={t("projectGrid.editAuditType")}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(project); }}
                  className="text-slate-600 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 shrink-0 ml-2 mt-0.5" />
        </div>

        {!docStatusLoading && docStatus ? (
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{t("projectGrid.outstandingTasks")}</span>
            <span
              className={
                docStatus.outstandingTaskCount > 0
                  ? "text-xs font-semibold text-amber-700 dark:text-amber-400"
                  : "text-xs font-semibold text-emerald-700 dark:text-emerald-400"
              }
            >
              {docStatus.outstandingTaskCount}
            </span>
          </div>
        ) : null}

        <div className="space-y-1.5">
          {PHASE_ORDER.map((phase, i) => {
            const label = PHASE_DISPLAY[phase];
            if (i < currentIndex) {
              return (
                <div key={phase} className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {t("projectGrid.complete")}
                  </span>
                </div>
              );
            }
            if (i === currentIndex) {
              const { currentphasetotal: total, currentphasecompleted: completed } = project;
              return (
                <div key={phase} className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{label}</span>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    {total === 0 ? t("projectGrid.inProgress") : t("projectGrid.taskProgress", { total, completed })}
                  </span>
                </div>
              );
            }
            return (
              <div key={phase} className="flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{t("projectGrid.notStarted")}</span>
              </div>
            );
          })}
        </div>
      </Link>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-3 w-full flex items-center justify-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {expanded ? t("projectGrid.hideDocuments") : t("projectGrid.showDocuments")}
      </button>

      {expanded && (
      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600 space-y-1.5">
        <ReportLinkCard
          icon={<FileText className="w-3.5 h-3.5 text-indigo-500" />}
          title={t("projectGrid.titleProjectOverview")}
          onClick={handleOpenOverview}
          updatedAt={docStatus?.projectOverview ?? null}
          loading={docStatusLoading}
          busy={openingOverview}
        />
        <ReportLinkCard
          icon={<GitBranch className="w-3.5 h-3.5 text-indigo-500" />}
          title={t("projectGrid.titleProjectLifecycle")}
          to={`/api/projects/${project.id}/lifecycle`}
          updatedAt={docStatus?.projectLifecycle ?? null}
          loading={docStatusLoading}
        />
        {/* [SCOPE 081 / T009] Development Plan — build roadmap PDF (mirrors Lifecycle). */}
        <ReportLinkCard
          icon={<ListChecks className="w-3.5 h-3.5 text-indigo-500" />}
          title={t("projectGrid.titleDevelopmentPlan")}
          to={`/api/projects/${project.id}/devplan`}
          updatedAt={docStatus?.developmentPlan ?? null}
          loading={docStatusLoading}
        />
        <ReportLinkCard
          icon={<Shield className="w-3.5 h-3.5 text-indigo-500" />}
          title={t("projectGrid.titleAuditReport")}
          to={`/projects/${project.id}/audit`}
          updatedAt={docStatus?.auditReport ?? null}
          loading={docStatusLoading}
        />
        <ReportLinkCard
          icon={<BookOpen className="w-3.5 h-3.5 text-indigo-500" />}
          title={t("projectGrid.titleCompoundLearnings")}
          to={`/projects/${project.id}/phase/learnings`}
          updatedAt={docStatus?.compoundLearning ?? null}
          loading={docStatusLoading}
        />
        {/* [SCOPE 060 / T014] Project-wide (cross-scope) Scope Analysis — authored in
            VS Code via /analyzescope all, pushed to the DB, viewed/exported here. */}
        <ReportLinkCard
          icon={<FileSearch className="w-3.5 h-3.5 text-indigo-500" />}
          title={t("projectGrid.titleProjectScopeAnalysis")}
          to={`/projects/${project.id}/scope-analysis`}
          updatedAt={docStatus?.projectScopeAnalysis ?? null}
          loading={docStatusLoading}
        />
        {/* [SCOPE 021 / T016] Platform-wide ER diagram — one global doc. Links to the
            in-app viewer page (which embeds the PDF in an iframe) rather than the raw
            /api endpoint, so it displays inline instead of downloading. */}
        <ReportLinkCard
          icon={<Database className="w-3.5 h-3.5 text-indigo-500" />}
          title={t("projectGrid.titleEntityDiagram")}
          to="/admin/database/erdiagram"
          updatedAt={databaseErd}
          loading={docStatusLoading}
        />
        {/* API Tokens tile removed (spec 028 Phase 11, 2026-05-23) —
            tokens are issued automatically by the kit-download flow. */}
      </div>
      )}
    </div>
  );
}

// ─── Main grid ────────────────────────────────────────────────────────────────

export interface DashboardProjectGridProps {
  projects: ProjectCard[] | undefined;
  isLoading: boolean;
  /** Optional — admin only. When supplied, the "New" button renders and calls this. */
  onNewProject?: () => void;
  /** Optional — admin only. When supplied, each card shows an edit pencil. */
  onEditProject?: (p: ProjectCard) => void;
  /** Override the default empty-state message (e.g. for team dashboards). */
  emptyStateMessage?: string;
}

export function DashboardProjectGrid({
  projects,
  isLoading,
  onNewProject,
  onEditProject,
  emptyStateMessage,
}: DashboardProjectGridProps) {
  const { t } = useTranslation();
  const [docStatusMap, setDocStatusMap] = useState<Record<string, ProjectDocStatus>>({});
  const [databaseErd, setDatabaseErd] = useState<string | null>(null); // [SCOPE 021 / T016]
  const [docStatusLoading, setDocStatusLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/doc-status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.resolve({ projects: {} })))
      .then((data: DocStatusResponse) => {
        setDocStatusMap(data.projects ?? {});
        setDatabaseErd(data.databaseErd ?? null);
      })
      .catch(() => setDocStatusMap({}))
      .finally(() => setDocStatusLoading(false));
  }, []);

  const byName = (a: ProjectCard, b: ProjectCard) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const activeProjects = (projects?.filter((p) => p.status === "ACTIVE") ?? []).sort(byName);
  const branchedProjects = (projects?.filter((p) => p.status === "BRANCHED") ?? []).sort(byName);

  const defaultEmpty = onNewProject
    ? t("projectGrid.emptyAdmin")
    : t("projectGrid.emptyTeam");
  const emptyMessage = emptyStateMessage ?? defaultEmpty;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-4">
        {onNewProject ? (
          <button
            onClick={onNewProject}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("projectGrid.newProject")}
          </button>
        ) : (
          <span />
        )}
        <Link
          to="/projects"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          {t("projectGrid.allProjects")} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">{t("common.loading")}</div>
      ) : activeProjects.length === 0 && branchedProjects.length === 0 ? (
        <div className="text-center text-slate-500 dark:text-slate-400 text-sm py-6">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-5">
          {activeProjects.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                {t("projectGrid.active")}
              </p>
              <div className="flex gap-3 items-start flex-wrap">
                {activeProjects.map((project) => (
                  <div key={project.id} className="w-72 shrink-0">
                    <ProjectOverviewCard
                      project={project}
                      onEdit={onEditProject}
                      docStatus={docStatusMap[project.id] ?? null}
                      databaseErd={databaseErd}
                      docStatusLoading={docStatusLoading}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {branchedProjects.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                {t("projectGrid.branched")}
              </p>
              <div className="flex gap-3 items-start flex-wrap">
                {branchedProjects.map((project) => (
                  <div key={project.id} className="w-72 shrink-0">
                    <ProjectOverviewCard
                      project={project}
                      onEdit={onEditProject}
                      docStatus={docStatusMap[project.id] ?? null}
                      databaseErd={databaseErd}
                      docStatusLoading={docStatusLoading}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
