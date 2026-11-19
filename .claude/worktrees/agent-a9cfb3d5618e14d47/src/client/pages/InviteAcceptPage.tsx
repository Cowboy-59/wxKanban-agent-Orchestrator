import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useTranslation } from "~/client/i18n";

type PageState = "loading" | "valid" | "expired" | "used" | "error" | "success";

interface InviteInfo {
  email: string;
  companyName: string;
}

/**
 * InviteAcceptPage — public page at /accept-invitation/:token.
 * Validates the token, shows company/role info, collects fullname + password + timezone.
 * On submit: POST /api/team/invite/:token/accept → success → redirect to /login.
 */
export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fullname, setFullname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
  );

  useEffect(() => {
    if (!token) {
      setPageState("error");
      return;
    }

    fetch(`/api/team/invite/${token}`)
      .then(async (res) => {
        if (res.status === 404) { setPageState("used"); return; }
        if (res.status === 410) { setPageState("expired"); return; }
        if (!res.ok) { setPageState("error"); return; }
        const data = await res.json() as { email: string; companyName: string };
        setInviteInfo(data);
        setPageState("valid");
      })
      .catch(() => setPageState("error"));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError(t("inviteAccept.errorPasswordMismatch"));
      return;
    }
    if (password.length < 8) {
      setFormError(t("inviteAccept.errorPasswordTooShort"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/team/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullname, password, timezone }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || t("inviteAccept.errorCreateAccountFailed"));
      }

      setPageState("success");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("inviteAccept.errorUnknown"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">wxKanban</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t("inviteAccept.subtitle")}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg p-8">
          {/* Loading */}
          {pageState === "loading" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 dark:border-indigo-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("inviteAccept.validating")}</p>
            </div>
          )}

          {/* Expired */}
          {pageState === "expired" && (
            <div className="text-center py-6 space-y-4">
              <Clock className="w-12 h-12 text-amber-500 mx-auto" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("inviteAccept.expiredTitle")}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("inviteAccept.expiredBody")}
              </p>
            </div>
          )}

          {/* Already used or not found */}
          {(pageState === "used" || pageState === "error") && (
            <div className="text-center py-6 space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {pageState === "used" ? t("inviteAccept.usedTitle") : t("inviteAccept.invalidTitle")}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {pageState === "used"
                  ? t("inviteAccept.usedBody")
                  : t("inviteAccept.invalidBody")}
              </p>
              <button
                onClick={() => navigate("/login")}
                className="mt-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {t("inviteAccept.goToLogin")}
              </button>
            </div>
          )}

          {/* Success */}
          {pageState === "success" && (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("inviteAccept.successTitle")}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("inviteAccept.successBody")}
              </p>
              <button
                onClick={() => navigate("/login")}
                className="mt-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {t("inviteAccept.logIn")}
              </button>
            </div>
          )}

          {/* Valid — show form */}
          {pageState === "valid" && inviteInfo && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center mb-2">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {t("inviteAccept.joinCompany", { company: inviteInfo.companyName })}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {t("inviteAccept.creatingAccountFor")} <strong>{inviteInfo.email}</strong>
                </p>
              </div>

              {formError && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
                </div>
              )}

              <div>
                <label htmlFor="fullname" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("inviteAccept.fullNameLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="fullname"
                  type="text"
                  required
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("inviteAccept.passwordLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("inviteAccept.passwordPlaceholder")}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("inviteAccept.confirmPasswordLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("inviteAccept.confirmPasswordPlaceholder")}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("inviteAccept.timezoneLabel")}
                </label>
                <input
                  id="timezone"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("inviteAccept.timezoneHint")}</p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {submitting ? t("inviteAccept.creatingAccount") : t("inviteAccept.createAccount")}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          {t("inviteAccept.alreadyHaveAccount")}{" "}
          <button
            onClick={() => navigate("/login")}
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {t("inviteAccept.signIn")}
          </button>
        </p>
      </div>
    </div>
  );
}
