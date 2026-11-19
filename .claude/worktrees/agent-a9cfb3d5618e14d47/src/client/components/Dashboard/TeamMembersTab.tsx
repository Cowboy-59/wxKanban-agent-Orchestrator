import { useEffect, useState } from "react";
import { Search, AlertCircle, Trash2, Pencil, Check, X, UserPlus, KeyRound, Mail } from "lucide-react";
import { InviteUserModal } from "../admin/InviteUserModal";
import { ConsultantsPanel } from "../admin/ConsultantsPanel";
import { useAuth } from "../../context/AuthContext";
import { SUPPORTED_LOCALES } from "../../i18n"; // [SCOPE 051]

interface TeamMember {
  id: string;
  email: string;
  fullname: string | null;
  active: boolean;
  usertype: string | null;
  joinedat: string | null;
  language: string; // [SCOPE 051] preferred UI locale
}

// spec 003 FR-065 — a pending invitation that has not yet been accepted (no user row yet).
interface PendingInvitation {
  id: string;
  email: string;
  status: string | null;
  expiresat: string | null;
  invitedat: string | null;
  usertype: string | null;
}

type FilterType = "all" | "active" | "inactive";

function usertypeBadgeClass(usertype: string | null): string {
  switch (usertype) {
    case "ADMIN":
      return "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300";
    case "TEAM_MANAGER":
      return "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300";
    default:
      return "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300";
  }
}

function usertypeLabel(usertype: string | null): string {
  switch (usertype) {
    case "ADMIN":
      return "Admin";
    case "TEAM_MANAGER":
      return "Manager";
    case "TEAM_MEMBER":
      return "Member";
    default:
      return usertype ?? "Member";
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function TeamMembersTab() {
  const { user: currentUser } = useAuth();
  const isCurrentUserAdmin = currentUser?.usertype === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSteps, setActionSteps] = useState<{ title: string; steps: string[] } | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]); // spec 003 FR-065
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [confirmCancelInvite, setConfirmCancelInvite] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null); // spec 002 FR-069
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [reinvitingId, setReinvitingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const response = await fetch("/api/team", {
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error("Failed to fetch team members");
      const data = await response.json();
      setMembers(data.members || []);
      setInvitations(data.invitations || []); // spec 003 FR-065 — pending invitations
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members
    .filter((m) => {
      if (filterType === "active" && !m.active) return false;
      if (filterType === "inactive" && m.active) return false;
      const search = searchTerm.toLowerCase();
      return (
        m.email.toLowerCase().includes(search) ||
        (m.fullname?.toLowerCase().includes(search) ?? false)
      );
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  // spec 003 FR-066 — resend a pending invitation (by invitation id, not user id).
  const handleResendInvitation = async (invitationId: string, email: string) => {
    setActionError(null);
    setActionSteps(null);
    setResendingInviteId(invitationId);
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}/resend`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to resend invitation");
      setActionSteps({ title: `Invitation resent to ${email}`, steps: body.steps ?? [] });
      void fetchTeamMembers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setResendingInviteId(null);
    }
  };

  // spec 003 FR-066/FR-067 — cancel a pending invitation (kept as "cancelled", not deleted).
  const handleCancelInvitation = async (invitationId: string) => {
    setActionError(null);
    setActionSteps(null);
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}/cancel`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to cancel invitation");
      }
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      setConfirmCancelInvite(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
      setConfirmCancelInvite(null);
    }
  };

  // spec 002 FR-069/FR-070 — admin toggles a member's active status (deactivate / reactivate).
  const handleSetActive = async (userId: string, active: boolean) => {
    setActionError(null);
    setActionSteps(null);
    try {
      const response = await fetch(`/api/team/${userId}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ active }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to update status");
      }
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, active } : m)));
      setConfirmDeactivate(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
      setConfirmDeactivate(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setActionError(null);
    setActionSteps(null);
    try {
      const response = await fetch(`/api/team/${userId}/remove`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to remove member");
      }
      setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, active: false } : m));
      setConfirmDelete(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
      setConfirmDelete(null);
    }
  };

  const handleReinvite = async (userId: string, email: string) => {
    setActionError(null);
    setActionSteps(null);
    setReinvitingId(userId);
    try {
      const response = await fetch(`/api/team/${userId}/reinvite`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to send invitation");
      setActionSteps({ title: `Re-invite sent to ${email}`, steps: body.steps ?? [] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setReinvitingId(null);
    }
  };

  const handleResetPassword = async (userId: string, email: string) => {
    setActionError(null);
    setActionSteps(null);
    setResettingId(userId);
    try {
      const response = await fetch(`/api/team/${userId}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders() },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to send reset email");
      setActionSteps({ title: `Password reset sent to ${email}`, steps: body.steps ?? [] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setResettingId(null);
    }
  };

  const startEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setEditName(member.fullname ?? "");
    setActionError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (userId: string) => {
    setActionError(null);
    try {
      const response = await fetch(`/api/team/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullname: editName }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to update member");
      }
      const body = await response.json();
      setMembers((prev) =>
        prev.map((m) =>
          m.id === userId ? { ...m, fullname: body.member.fullname } : m
        )
      );
      setEditingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  // spec 003 FR-066 — admin changes a member's role (usertype). Optimistic, reverts on failure.
  const handleChangeRole = async (userId: string, usertype: string) => {
    setActionError(null);
    const previous = members.find((m) => m.id === userId)?.usertype ?? null;
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, usertype } : m)));
    try {
      const response = await fetch(`/api/team/${userId}/role`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ usertype }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to change role");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, usertype: previous } : m)));
    }
  };

  // [SCOPE 051] ADMIN sets a member's preferred language.
  const handleChangeLanguage = async (userId: string, language: string) => {
    setActionError(null);
    // optimistic update
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, language } : m)));
    try {
      const response = await fetch(`/api/company/users/${userId}/language`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to update language");
      }
      const body = await response.json();
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, language: body.member.language } : m)),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unknown error");
      void fetchTeamMembers(); // revert optimistic update on failure
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400" />
          <p className="mt-4 text-slate-500 dark:text-slate-400">Loading team members...</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">Error loading team</h3>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">{fetchError}</p>
            <button
              onClick={fetchTeamMembers}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-300"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite modal */}
      {inviteModalOpen && (
        <InviteUserModal
          onClose={() => setInviteModalOpen(false)}
          onSuccess={fetchTeamMembers}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Team Members</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setInviteModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">{actionError}</p>
          <button onClick={() => setActionError(null)} className="ml-auto text-red-500 hover:text-red-700 dark:hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action steps panel */}
      {actionSteps && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">{actionSteps.title}</p>
            </div>
            <button onClick={() => setActionSteps(null)} className="text-green-500 hover:text-green-700 dark:hover:text-green-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-1 ml-6">
            {actionSteps.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-green-700 dark:text-green-400">
                <Check className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>

        <div className="flex gap-2">
          {(["all", "active", "inactive"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterType === type
                  ? "bg-indigo-600 dark:bg-indigo-500 text-white"
                  : "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filteredMembers.length === 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">No team members match your filters.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Role</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Language</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Joined</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredMembers.map((member) => {
                  const isAdmin = member.usertype === "ADMIN";
                  const isEditing = editingId === member.id;

                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{member.email}</td>

                      <td className="px-6 py-4 text-sm">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(member.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-sm w-36 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              autoFocus
                            />
                            <button
                              onClick={() => saveEdit(member.id)}
                              className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-900 dark:text-slate-100">
                            {member.fullname || <span className="text-slate-400 dark:text-slate-500 italic">—</span>}
                          </span>
                        )}
                      </td>

                      {/* spec 003 FR-066 — Role editable by admin for other members (not self) */}
                      <td className="px-6 py-4">
                        {isCurrentUserAdmin && member.id !== currentUser?.userid ? (
                          <select
                            value={member.usertype ?? "TEAM_MEMBER"}
                            onChange={(e) => handleChangeRole(member.id, e.target.value)}
                            className="text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            title="Change this member's role"
                          >
                            <option value="ADMIN">Admin</option>
                            <option value="TEAM_MANAGER">Manager</option>
                            <option value="TEAM_MEMBER">Member</option>
                          </select>
                        ) : (
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${usertypeBadgeClass(member.usertype)}`}>
                            {usertypeLabel(member.usertype)}
                          </span>
                        )}
                      </td>

                      {/* [SCOPE 051] Language — editable by ADMIN, read-only otherwise */}
                      <td className="px-6 py-4">
                        {isCurrentUserAdmin ? (
                          <select
                            value={member.language}
                            onChange={(e) => handleChangeLanguage(member.id, e.target.value)}
                            className="text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            title="Set this member's language"
                          >
                            {SUPPORTED_LOCALES.map((l) => (
                              <option key={l.code} value={l.code}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {SUPPORTED_LOCALES.find((l) => l.code === member.language)?.label ?? member.language}
                          </span>
                        )}
                      </td>

                      {/* spec 002 FR-069/FR-070 — admin can toggle Active⇄Inactive (others see a static badge) */}
                      <td className="px-6 py-4">
                        {isCurrentUserAdmin && !isAdmin ? (
                          member.active ? (
                            confirmDeactivate === member.id ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-xs text-slate-500 dark:text-slate-400"
                                  title="Deactivating removes this member's access until an admin reactivates them."
                                >
                                  Set inactive?
                                </span>
                                <button
                                  onClick={() => handleSetActive(member.id, false)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmDeactivate(null)}
                                  className="px-2 py-1 border border-slate-200 dark:border-slate-700 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeactivate(member.id)}
                                className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 hover:ring-2 hover:ring-green-300 dark:hover:ring-green-700 transition"
                                title="Click to set Inactive"
                              >
                                Active
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => handleSetActive(member.id, true)}
                              className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700 transition"
                              title="Click to Reactivate"
                            >
                              Inactive
                            </button>
                          )
                        ) : (
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              member.active
                                ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {member.active ? "Active" : "Inactive"}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {member.joinedat
                          ? new Date(member.joinedat).toLocaleDateString()
                          : "—"}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {/* Edit button — always shown, not for editing usertype */}
                          {!isEditing && (
                            <button
                              onClick={() => startEdit(member)}
                              className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              title="Edit name"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {/* Admin-only actions: re-invite + reset password + remove */}
                          {isCurrentUserAdmin && !isAdmin && !isEditing && (
                            <>
                              <button
                                onClick={() => handleReinvite(member.id, member.email)}
                                disabled={reinvitingId === member.id}
                                className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-40"
                                title="Re-send invitation email"
                              >
                                <Mail className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleResetPassword(member.id, member.email)}
                                disabled={resettingId === member.id}
                                className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-40"
                                title="Send password reset email"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>

                              {confirmDelete === member.id ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">Remove?</span>
                                  <button
                                    onClick={() => handleRemoveMember(member.id)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(member.id)}
                                  className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                  title="Remove member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* spec 003 FR-065/FR-066 — Pending Invitations (admin-only). The list comes from
          GET /api/team's `invitations`; actions are resend + cancel by invitation id. */}
      {isCurrentUserAdmin && invitations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Pending Invitations
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({invitations.length})
            </span>
          </h3>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Invited</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Expires</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {invitations.map((inv) => {
                    const expired = inv.expiresat ? new Date(inv.expiresat).getTime() < Date.now() : false;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{inv.email}</td>
                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                          {inv.invitedat ? new Date(inv.invitedat).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                          {inv.expiresat ? new Date(inv.expiresat).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              expired
                                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300"
                            }`}
                          >
                            {expired ? "Expired" : "Pending"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => handleResendInvitation(inv.id, inv.email)}
                              disabled={resendingInviteId === inv.id}
                              className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-40"
                              title="Resend invitation (new link, fresh 7-day expiry)"
                            >
                              <Mail className="w-4 h-4" />
                            </button>

                            {confirmCancelInvite === inv.id ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-xs text-slate-500 dark:text-slate-400"
                                  title="Are you sure? User cannot accept invitation after cancellation. You can resend a new invitation."
                                >
                                  Cancel invite?
                                </span>
                                <button
                                  onClick={() => handleCancelInvitation(inv.id)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmCancelInvite(null)}
                                  className="px-2 py-1 border border-slate-200 dark:border-slate-700 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmCancelInvite(inv.id)}
                                className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title="Cancel invitation"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Spec 037 — Consultants section (engaged Consulting Companies). */}
      <ConsultantsPanel />
    </div>
  );
}
