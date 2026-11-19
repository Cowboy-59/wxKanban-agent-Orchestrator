/**
 * ConsultantProvisionForm
 * Spec 037 — Consultants Management (Engagement Core), T057
 *
 * Route: /engagements/invite/:token/setup
 *
 * Engagement-invitation landing page. Handles BOTH the auto-provision (new
 * email) and existing-user accept paths, branching by the visitor's auth
 * state vs the invited email:
 *
 *   - Not signed in + new email     → show provision form
 *   - Not signed in + existing email→ show provision form WITH "Already have
 *                                      an account? Sign in" link at top
 *     (the page can't reliably tell upfront whether the email exists; the
 *      "Sign in" link is always offered for users who already have accounts)
 *   - Signed in + invited email matches the user → "Accept on behalf of your
 *                                                   firm" button (POST accept
 *                                                   with empty body)
 *   - Signed in + invited email DOES NOT match → "You're signed in as X but
 *                                                 this invite is for Y. Sign
 *                                                 out to continue."
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Briefcase,
  AlertCircle,
  CheckCircle2,
  LogIn,
  UserX,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface InviteInfo {
  invitedEmail: string;
  clientCompanyName: string;
  clientCompanyId: string | null;
  message: string | null;
  expiresAt: string;
}

// [SCOPE 037 / T057] BEGIN — ConsultantProvisionForm
export default function ConsultantProvisionForm() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [pageState, setPageState] = useState<
    "loading" | "valid" | "expired" | "used" | "error"
  >("loading");

  // provision-form state
  const [companyName, setCompanyName] = useState("");
  const [contactFullName, setContactFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPageState("error");
      return;
    }
    fetch(`/api/engagements/invite/${token}`)
      .then(async (r) => {
        if (r.status === 404) {
          setPageState("used");
          return;
        }
        if (r.status === 410) {
          setPageState("expired");
          return;
        }
        if (!r.ok) {
          setPageState("error");
          return;
        }
        const data = (await r.json()) as InviteInfo;
        setInfo(data);
        setPageState("valid");
      })
      .catch(() => setPageState("error"));
  }, [token]);

  // ── Existing-user accept (signed in, invited email matches) ────────────────
  const acceptAsExistingUser = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/engagements/invite/${token}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Failed to accept engagement");
      navigate(`/engagements/${body.engagement.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── New-email provision-and-accept ─────────────────────────────────────────
  const submitProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!acceptTerms) {
      setError("Please accept the CONSULTANT-plan terms");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/engagements/invite/${token}/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provisionCompany: {
            companyName,
            contactFullName,
            password,
            acceptTerms: true,
            timezone:
              Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
          },
        }),
      });
      const body = await r.json();
      if (!r.ok) {
        if (r.status === 401 && body.code === "AUTH_REQUIRED") {
          // Edge case: backend says an account exists for this email; user
          // should sign in instead. Show a redirect prompt.
          setError(
            "An account exists for this email. Please sign in (top of page) to accept.",
          );
          return;
        }
        throw new Error(body.error || "Failed to accept engagement");
      }
      navigate(`/engagements/${body.engagement.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / error / expired / used ───────────────────────────────────────
  if (pageState === "loading" || authLoading) {
    return (
      <ShellWrapper>
        <div className="flex flex-col items-center py-8 gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" />
          <p className="text-sm text-slate-500">Validating invitation…</p>
        </div>
      </ShellWrapper>
    );
  }
  if (pageState === "expired") {
    return (
      <ShellWrapper>
        <div className="text-center py-6 space-y-3">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Invitation Expired
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This engagement invitation has expired. Ask the inviter to resend.
          </p>
        </div>
      </ShellWrapper>
    );
  }
  if (pageState === "used" || pageState === "error" || !info) {
    return (
      <ShellWrapper>
        <div className="text-center py-6 space-y-3">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Invitation not available
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This link is no longer valid. It may have been accepted, revoked,
            or never existed.
          </p>
        </div>
      </ShellWrapper>
    );
  }

  // ── Valid token branches ───────────────────────────────────────────────────

  // Signed in AND invited email matches the signed-in user.
  if (isAuthenticated && user && user.email === info.invitedEmail) {
    return (
      <ShellWrapper>
        <InviteSummary info={info} />
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-sm text-emerald-800 dark:text-emerald-200">
          You are signed in as <strong>{user.email}</strong>. Accepting will
          link <strong>{info.clientCompanyName}</strong> to your existing tenant
          and create the engagement.
        </div>
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        <button
          onClick={acceptAsExistingUser}
          disabled={submitting}
          className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            "Accepting…"
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" /> Accept engagement
            </>
          )}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          Your primary Company must be on the CONSULTANT plan and you must be
          ADMIN. If not, the accept will fail with a clear error.
        </p>
      </ShellWrapper>
    );
  }

  // Signed in but the invited email DOES NOT match the signed-in user.
  if (isAuthenticated && user && user.email !== info.invitedEmail) {
    return (
      <ShellWrapper>
        <InviteSummary info={info} />
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-200 flex items-start gap-3">
          <UserX className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Wrong account signed in</p>
            <p className="mt-1">
              You're signed in as <strong>{user.email}</strong>, but this
              invitation is for <strong>{info.invitedEmail}</strong>. Sign out
              and sign back in with the correct account to accept.
            </p>
          </div>
        </div>
        <button
          onClick={async () => {
            await logout();
            window.location.reload();
          }}
          className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4" /> Sign out
        </button>
      </ShellWrapper>
    );
  }

  // Not signed in — show provision form with "Already have an account?" link.
  return (
    <ShellWrapper>
      <InviteSummary info={info} />

      {/* "Already have an account?" affordance — the only graceful path
          for existing-user accept when arriving fresh from email. */}
      <div className="rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 p-3 text-sm text-sky-900 dark:text-sky-200 flex items-center justify-between gap-3">
        <span>Already have a wxKanban account at this email?</span>
        <a
          href={`/login?return=${encodeURIComponent(`/engagements/invite/${token}/setup`)}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded"
        >
          <LogIn className="w-3 h-3" /> Sign in
        </a>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Otherwise, set up your Consulting Company tenant below. You'll be
        signed in automatically when done.
      </p>

      <form onSubmit={submitProvision} className="space-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
            Consulting Company name *
          </label>
          <input
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="HAS Enterprises LLC"
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
            Your full name *
          </label>
          <input
            type="text"
            required
            value={contactFullName}
            onChange={(e) => setContactFullName(e.target.value)}
            placeholder="Howard Smith"
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
            Password *
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            placeholder="At least 8 characters"
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
            Confirm password *
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-1"
          />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            I accept the CONSULTANT-plan terms. My new tenant starts on a
            free/trial billing state — I'm not subscribed to a paid plan.
          </span>
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            "Setting up…"
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" /> Accept & set up
            </>
          )}
        </button>
      </form>
    </ShellWrapper>
  );
}
// [SCOPE 037 / T057] END

// ───────────────────────────────────────────────────────────────────────────

function ShellWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            wxKanban
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Consulting Engagement
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg p-8 space-y-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function InviteSummary({ info }: { info: InviteInfo }) {
  return (
    <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4 flex items-start gap-3">
      <Briefcase className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="text-slate-900 dark:text-slate-100 font-medium">
          {info.clientCompanyName}
        </p>
        <p className="text-slate-600 dark:text-slate-400 mt-0.5">
          has invited <strong>{info.invitedEmail}</strong> to a consulting
          engagement on wxKanban.
        </p>
        {info.message && (
          <p className="mt-2 italic text-slate-700 dark:text-slate-300">
            "{info.message}"
          </p>
        )}
      </div>
    </div>
  );
}
