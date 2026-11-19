import { useState } from "react";
import { X, UserPlus, AlertCircle, Crown, Users, User, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

interface InviteUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type UserType = "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER";

/**
 * InviteUserModal — modal to send team member invitation via email with role selection.
 * Submits POST /api/company/users. Closes on success.
 */
export function InviteUserModal({ onClose, onSuccess }: InviteUserModalProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [usertype, setUsertype] = useState<UserType>("TEAM_MEMBER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const seatsUsed = user?.seatsused ?? 0;
  const maxUsers = user?.maxusers ?? 5;
  const billingPlan = user?.billingplan ?? "FREE";
  const nearSeatCap = seatsUsed >= maxUsers - 1;
  const atSeatCap = seatsUsed >= maxUsers;

  const canAssignTeamManager = ["CONSULTANT", "ENTERPRISE"].includes(billingPlan);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUpgradeRequired(false);
    setLoading(true);

    try {
      const response = await fetch("/api/invitations/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: [email], usertype }),
      });

      const body = await response.json();

      if (!response.ok) {
        if (body.upgrade) {
          setUpgradeRequired(true);
        }
        throw new Error(body.error || "Failed to send invitation");
      }

      const failed = body.results?.failed ?? [];
      if (failed.length > 0) {
        throw new Error(failed[0].error || "Failed to send invitation");
      }

      setSentTo(email);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-indigo-500" />
            Invite Team Member
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {sentTo ? (
          <div className="p-6 space-y-4">
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">Invitation sent</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  An invitation email has been sent to <span className="font-medium">{sentTo}</span>. They have 7 days to accept.
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  To resend or revoke, visit the <span className="font-medium">Personnel</span> page.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setEmail("");
                  setError(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Send another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Seat warning */}
          {atSeatCap && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Seat limit reached</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Your {billingPlan} plan allows {maxUsers} users. Upgrade to CONSULTANT for unlimited members.
                </p>
              </div>
            </div>
          )}

          {!atSeatCap && nearSeatCap && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                You&apos;re using {seatsUsed} of {maxUsers} seats on your {billingPlan} plan.
              </p>
            </div>
          )}

          {/* Upgrade required for Team Manager */}
          {upgradeRequired && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 flex items-start gap-3">
              <Crown className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">Plan upgrade required</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">
                  Team Manager role requires CONSULTANT plan or higher. Upgrade to unlock this feature.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !upgradeRequired && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label
              htmlFor="invite-email"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              disabled={atSeatCap}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Role selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Role <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${usertype === "ADMIN" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"} ${atSeatCap ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input
                  type="radio"
                  name="usertype"
                  value="ADMIN"
                  checked={usertype === "ADMIN"}
                  onChange={(e) => setUsertype(e.target.value as UserType)}
                  disabled={atSeatCap}
                  className="sr-only"
                />
                <Crown className="w-5 h-5 text-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Admin</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Full company control, billing, team management</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${usertype === "TEAM_MANAGER" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"} ${atSeatCap || !canAssignTeamManager ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input
                  type="radio"
                  name="usertype"
                  value="TEAM_MANAGER"
                  checked={usertype === "TEAM_MANAGER"}
                  onChange={(e) => setUsertype(e.target.value as UserType)}
                  disabled={atSeatCap || !canAssignTeamManager}
                  className="sr-only"
                />
                <Users className="w-5 h-5 text-indigo-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Team Manager</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Project management, no billing access
                    {!canAssignTeamManager && <span className="text-amber-600 dark:text-amber-400 ml-1">(Requires CONSULTANT+)</span>}
                  </p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${usertype === "TEAM_MEMBER" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"} ${atSeatCap ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input
                  type="radio"
                  name="usertype"
                  value="TEAM_MEMBER"
                  checked={usertype === "TEAM_MEMBER"}
                  onChange={(e) => setUsertype(e.target.value as UserType)}
                  disabled={atSeatCap}
                  className="sr-only"
                />
                <User className="w-5 h-5 text-slate-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Team Member</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Task-focused, time tracking, assigned projects</p>
                </div>
              </label>
            </div>
          </div>


          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || atSeatCap || !email}
              className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {loading ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
