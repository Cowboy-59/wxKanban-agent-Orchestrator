import { AppShell } from "../components/layout/AppShell";
import { SubscriptionCard } from "../components/admin/SubscriptionCard";
import { UpgradeLock } from "../components/admin/UpgradeLock";
import { RoleLock } from "../components/admin/RoleLock";
import { TimeBillingDashboardCard } from "../components/timeBilling/TimeBillingDashboardCard"; // [SCOPE 005 / T014]
import { DailyDigestPreview } from "../components/admin/DailyDigestPreview";
import { ActivityFeed } from "../components/admin/ActivityFeed";
import { SystemHealth } from "../components/admin/SystemHealth";
import { CreateProjectModal } from "../components/Projects/CreateProjectModal";
import { useAuth } from "../context/AuthContext";
import { useProjects } from "../lib/hooks/useProjects";
import { formatBillingPlan } from "../lib/billingPlan";
import { Users, FolderKanban, Clock, BarChart3, X } from "lucide-react";
import ProjectProposalsPanel from "../components/Dashboard/ProjectProposalsPanel";
import PendingTasksSummaryPanel from "../components/Dashboard/PendingTasksSummaryPanel";
import { EngagementsWidget } from "../components/admin/EngagementsWidget";
import { DashboardProjectGrid } from "../components/Dashboard/DashboardProjectGrid";
import { ReactNode, useEffect, useRef, useState } from "react";
import type { ProjectCard } from "~/shared/types/projects";
import { useTranslation } from "../i18n"; // [SCOPE 052] admin dashboard i18n

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{value}</p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Audit type constants ─────────────────────────────────────────────────────

// [SCOPE 112 / T006] MODIFIED-BY — enablement is a per-project SET of frameworks
// written through /api/audit/config, replacing the single `audittype` varchar written
// through PATCH /api/projects/:id. `flag` is the appauditconfiguration column.
const FRAMEWORKS = [
  { key: "SOC2", label: "SOC 2", flag: "soc2enabled" },
  { key: "HIPAA", label: "HIPAA", flag: "hipaaenabled" },
  { key: "HITRUST", label: "HITRUST", flag: "hitrustenabled" },
  { key: "GDPR", label: "GDPR", flag: "gdprenabled" },
  { key: "NISTSSDF", label: "NIST SSDF", flag: "nistssdfenabled" },
  { key: "ISO27001", label: "ISO 27001", flag: "iso27001enabled" },
] as const;

// ─── Edit Audit Modal ─────────────────────────────────────────────────────────

function EditAuditModal({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectCard;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(project.activeframeworks ?? []),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Every flag is sent, not just the enabled ones — omitting a flag would leave a
      // previously-enabled framework on, so a de-select would silently not save.
      const body: Record<string, boolean> = {};
      for (const fw of FRAMEWORKS) body[fw.flag] = selected.has(fw.key);

      const res = await fetch(`/api/audit/config?projectId=${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? t("adminDashboard.saveFailed"));
      }
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl w-80 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("adminDashboard.editAuditType")}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Project name */}
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">
          {project.name}
        </p>

        {/* Framework set — several may apply to one project */}
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          {t("adminDashboard.complianceFramework")}
        </label>
        <div className="space-y-1.5">
          {FRAMEWORKS.map((fw) => (
            <label
              key={fw.key}
              className="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(fw.key)}
                onChange={() => toggle(fw.key)}
                className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              {fw.label}
            </label>
          ))}
        </div>
        {selected.size === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {t("adminDashboard.none")}
          </p>
        )}

        {error && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4 justify-end">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useProjects();
  const [editingProject, setEditingProject] = useState<ProjectCard | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [proposalPrefill, setProposalPrefill] = useState<{ id: string; title: string; description: string | null } | null>(null);

  const activeProjects = projects?.filter((p: ProjectCard) => p.status === "ACTIVE") ?? [];

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ proposalId: string; title: string; description: string | null }>).detail;
      if (!detail?.proposalId) return;
      setProposalPrefill({ id: detail.proposalId, title: detail.title, description: detail.description });
      setShowCreateModal(true);
    };
    window.addEventListener("create-project-from-proposal", handler);
    return () => window.removeEventListener("create-project-from-proposal", handler);
  }, []);

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t("adminDashboard.title")}
            <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">—</span>
            <span className="ml-2 text-indigo-600 dark:text-indigo-400 font-semibold">
              {formatBillingPlan(user?.billingplan)}
            </span>
            {user?.companyname && (
              <>
                <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">·</span>
                <span className="ml-2 text-slate-700 dark:text-slate-200 font-semibold">
                  {user.companyname}
                </span>
              </>
            )}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("adminDashboard.welcomeBack", { email: user?.email ?? "" })}
          </p>
        </div>

        {/* Top row: subscription card + stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SubscriptionCard />

          <StatCard
            label={t("adminDashboard.teamMembers")}
            value={user?.seatsused ?? 1}
            icon={<Users className="w-4 h-4" />}
          />
          <StatCard
            label={t("adminDashboard.activeProjects")}
            value={projectsLoading ? "…" : activeProjects.length}
            icon={<FolderKanban className="w-4 h-4" />}
          />
          <StatCard
            label={t("adminDashboard.hoursThisWeek")}
            value="0h"
            icon={<Clock className="w-4 h-4" />}
          />
        </div>

        {/* Project Overview — shared grid (spec 002 FR-106) */}
        <DashboardProjectGrid
          projects={projects}
          isLoading={projectsLoading}
          onNewProject={() => setShowCreateModal(true)}
          onEditProject={setEditingProject}
        />

        {/* Create Project Modal */}
        <CreateProjectModal
          open={showCreateModal}
          onClose={() => { setShowCreateModal(false); setProposalPrefill(null); }}
          onCreated={() => {
            refetchProjects();
            if (proposalPrefill) {
              window.dispatchEvent(new CustomEvent("proposals-changed"));
            }
            setShowCreateModal(false);
            setProposalPrefill(null);
          }}
          proposal={proposalPrefill}
        />

        {/* Edit Audit Modal */}
        {editingProject && (
          <EditAuditModal
            project={editingProject}
            onClose={() => setEditingProject(null)}
            onSaved={() => { refetchProjects(); }}
          />
        )}

        {/* Project Proposals & Pending Tasks (Spec 024) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProjectProposalsPanel />
          <PendingTasksSummaryPanel />
        </div>

        {/* Spec 037 — Engagements quick-view (self-hides when zero engagements) */}
        <EngagementsWidget />

        {/* Digest preview + Activity feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DailyDigestPreview />
          <ActivityFeed />
        </div>

        {/* [SCOPE 005 / T014] Time & Billing — Business plan and up, ADMIN only; links to the page */}
        <TimeBillingDashboardCard />

        {/* System Health — ADMIN only */}
        <RoleLock requiredUsertype="ADMIN" featureName={t("adminDashboard.systemHealth")}>
          <SystemHealth />
        </RoleLock>

        {/* Reports — tier-gated (CONSULTANT+) + role-locked (ADMIN only) */}
        <UpgradeLock
          requiredPlan="CONSULTANT"
          featureName={t("adminDashboard.reportsAnalytics")}
          featureDescription={t("adminDashboard.reportsDesc")}
        >
          <RoleLock requiredUsertype="ADMIN" featureName={t("adminDashboard.reports")}>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                {t("adminDashboard.reports")}
              </h3>
              <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                {t("adminDashboard.reportsPlaceholder")}
              </div>
            </div>
          </RoleLock>
        </UpgradeLock>
      </div>
    </AppShell>
  );
}
