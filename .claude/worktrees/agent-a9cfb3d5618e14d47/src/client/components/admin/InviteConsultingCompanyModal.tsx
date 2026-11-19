/**
 * InviteConsultingCompanyModal
 * Spec 037 — Consultants Management (Engagement Core), T053
 *
 * Modal for sending an engagement invitation by email of the Consulting
 * Company's primary contact. Posts POST /api/engagements/invite. On success
 * displays a green confirmation with "Send another" / "Done" actions.
 *
 * Distinct from InviteUserModal: no role field (consultants don't have
 * wxKanban-team roles); copy explains the engagement relationship rather
 * than team membership.
 */

import { useState } from "react";
import { X, Briefcase, AlertCircle, CheckCircle2 } from "lucide-react";

interface InviteConsultingCompanyModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

// [SCOPE 037 / T053] BEGIN — InviteConsultingCompanyModal component
export function InviteConsultingCompanyModal({
  onClose,
  onSuccess,
}: InviteConsultingCompanyModalProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/engagements/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitedemail: email,
          message: message || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to send engagement invitation");
      }
      setSentTo(email);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-sky-500" />
            Invite Consulting Company
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
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
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Engagement invitation sent
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  Sent to <span className="font-medium">{sentTo}</span>. They
                  have 7 days to review and accept on behalf of their firm.
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  Once accepted, you'll see the engagement in the Consultants
                  section below.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setEmail("");
                  setMessage("");
                  setError(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Send another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Engage a consulting firm to do scoped work inside your projects.
              The consultant's firm stays its own tenant; they will sub-assign
              their own members to whatever scopes or tasks you grant.
            </p>

            {error && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <div>
              <label
                htmlFor="engagement-invite-email"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Primary contact email <span className="text-red-500">*</span>
              </label>
              <input
                id="engagement-invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="howard@hasenterprises.com"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Send to the firm's primary contact (typically an ADMIN of their
                Consulting Company tenant). If no wxKanban account exists at
                this email, the recipient will be guided through a quick setup.
              </p>
            </div>

            <div>
              <label
                htmlFor="engagement-invite-message"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Personal message (optional)
              </label>
              <textarea
                id="engagement-invite-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="A short note about the engagement (max 500 chars)"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-right">
                {message.length}/500
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg"
              >
                {loading ? "Sending..." : "Send invitation"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
// [SCOPE 037 / T053] END
