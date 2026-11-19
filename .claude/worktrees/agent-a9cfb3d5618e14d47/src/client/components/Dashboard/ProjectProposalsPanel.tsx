import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from "../../i18n";
import { RefreshCw, Plus, ChevronDown, ChevronRight, Lightbulb, Pencil } from 'lucide-react';
import type { ProjectProposal, ProposalStatus } from '../../../shared/types/proposals';
import AddProposalDialog from './AddProposalDialog';

const STATUS_CONFIG: Record<ProposalStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  good_idea: { label: 'Good Idea', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  accepted: { label: 'Accepted', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  rejected: { label: 'Rejected', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-gray-500 dark:text-gray-400',
};

export default function ProjectProposalsPanel() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);

  const handleEdit = async (proposalId: string) => {
    try {
      setEditingProposalId(proposalId);
      setError(null);
      const res = await fetch(`/api/overview/draft-by-proposal/${proposalId}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("projectProposals.errorFindDraft"));
      }
      const { draftid } = (await res.json()) as { draftid: string };
      navigate(`/overview/${draftid}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectProposals.errorOpenEditor"));
      setEditingProposalId(null);
    }
  };

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/proposals', { credentials: 'include' });
      if (!res.ok) throw new Error(t("projectProposals.errorFetch", { status: res.status }));
      const data = await res.json();
      setProposals(data.proposals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectProposals.errorLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  useEffect(() => {
    const handler = () => fetchProposals();
    window.addEventListener("proposals-changed", handler);
    return () => window.removeEventListener("proposals-changed", handler);
  }, []);

  const handleStatusChange = async (proposalId: string, newStatus: ProposalStatus, rejectionreason?: string) => {
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus, rejectionreason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("projectProposals.errorUpdateStatus"));
        return;
      }
      await fetchProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("projectProposals.errorUpdateStatus"));
    }
  };

  const handleReject = (proposalId: string) => {
    const reason = prompt(t("projectProposals.rejectionReasonPrompt"));
    if (reason) {
      handleStatusChange(proposalId, 'rejected', reason);
    }
  };

  const isAdmin = user?.usertype === 'ADMIN';

  // Sort: pending first, then good_idea, then accepted, then rejected
  const statusOrder: ProposalStatus[] = ['pending', 'good_idea', 'accepted', 'rejected'];
  const sorted = [...proposals].sort((a, b) => {
    const ai = statusOrder.indexOf(a.status as ProposalStatus);
    const bi = statusOrder.indexOf(b.status as ProposalStatus);
    if (ai !== bi) return ai - bi;
    return new Date(b.proposeddate).getTime() - new Date(a.proposeddate).getTime();
  });

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <Lightbulb className="w-4 h-4 text-yellow-500" />
          {t("projectProposals.title")}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
            ({proposals.length})
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
          >
            <Plus className="w-3 h-3" />
            {t("projectProposals.addProposal")}
          </button>
          <button
            onClick={fetchProposals}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="space-y-2">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("projectProposals.loadingProposals")}</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("projectProposals.empty")}</p>
          ) : (
            sorted.map((p) => {
              const statusKey = STATUS_CONFIG[p.status as ProposalStatus] ? (p.status as ProposalStatus) : 'pending';
              const cfg = STATUS_CONFIG[statusKey];
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {p.title}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                        {t(`projectProposals.status_${statusKey}`)}
                      </span>
                      {p.priority && (
                        <span className={`text-xs ${PRIORITY_COLORS[p.priority] || ''}`}>
                          {p.priority}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {p.source} &middot; {new Date(p.proposeddate).toLocaleDateString()}
                      {p.estimatedeffort && ` \u00b7 ${p.estimatedeffort}`}
                    </div>
                  </div>

                  {/* Edit (author or admin, while editable) */}
                  {(p.status === 'pending' || p.status === 'good_idea') &&
                    (isAdmin || p.createdbyid === user?.userid) && (
                      <button
                        onClick={() => handleEdit(p.id)}
                        disabled={editingProposalId === p.id}
                        className="flex items-center gap-1 text-xs px-2 py-1 ml-2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 shrink-0"
                        title={t("projectProposals.editTitle")}
                      >
                        <Pencil className="w-3 h-3" />
                        {editingProposalId === p.id ? t("common.loading") : t("common.edit")}
                      </button>
                    )}

                  {/* Actions (Admin only) */}
                  {isAdmin && !p.projectid && (
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {p.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(p.id, 'good_idea')}
                            className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          >
                            {t("projectProposals.goodIdea")}
                          </button>
                          <button
                            onClick={() => handleReject(p.id)}
                            className="text-xs px-2 py-1 rounded bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
                          >
                            {t("projectProposals.reject")}
                          </button>
                        </>
                      )}
                      {p.status === 'good_idea' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(p.id, 'accepted')}
                            className="text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50"
                          >
                            {t("projectProposals.accept")}
                          </button>
                          <button
                            onClick={() => handleReject(p.id)}
                            className="text-xs px-2 py-1 rounded bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
                          >
                            {t("projectProposals.reject")}
                          </button>
                        </>
                      )}
                      {p.status === 'accepted' && !p.projectid && (
                        <button
                          onClick={() => {
                            // Navigate to project creation with pre-filled data
                            // This will be wired in Batch 6
                            window.dispatchEvent(new CustomEvent('create-project-from-proposal', {
                              detail: { proposalId: p.id, title: p.title, description: p.description },
                            }));
                          }}
                          className="text-xs px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                        >
                          {t("projectProposals.createProject")}
                        </button>
                      )}
                      {p.status === 'rejected' && (
                        <button
                          onClick={() => handleStatusChange(p.id, 'pending')}
                          className="text-xs px-2 py-1 rounded bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                        >
                          {t("projectProposals.reopen")}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Show linked project */}
                  {p.projectid && (
                    <span className="text-xs text-green-600 dark:text-green-400 ml-2">
                      {t("projectProposals.projectCreated")}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Add Proposal Dialog */}
      <AddProposalDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onCreated={fetchProposals}
      />
    </div>
  );
}
